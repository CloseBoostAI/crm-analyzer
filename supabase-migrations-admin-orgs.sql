-- Admin-created organizations: add role to invites, admin_create_organization function
-- Run this in Supabase SQL Editor after supabase-migrations-org.sql

-- Add role to pending_invites (default 'member', can be 'owner' for leader invites)
alter table public.pending_invites
  add column if not exists role text not null default 'member' check (role in ('owner', 'admin', 'member'));

-- Update accept_invite to use role from invite
create or replace function public.accept_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  uid uuid;
  inv_role text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into inv from public.pending_invites
  where token = invite_token and expires_at > now()
  limit 1;
  if not found then
    raise exception 'Invalid or expired invite';
  end if;
  inv_role := coalesce(inv.role, 'member');
  insert into public.organization_members (organization_id, user_id, role)
  values (inv.organization_id, uid, inv_role)
  on conflict (organization_id, user_id) do update set role = inv_role;
  delete from public.pending_invites where id = inv.id;
  return inv.organization_id;
end;
$$;

-- Function for admin to create org with leader (bypasses RLS)
-- leader_email: if user exists, add as owner; if not, create owner invite
create or replace function public.admin_create_organization(
  p_org_name text,
  p_seat_limit int,
  p_leader_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  leader_id uuid;
begin
  if p_leader_email is null or trim(p_leader_email) = '' then
    raise exception 'Leader email is required';
  end if;
  if p_seat_limit < 1 then
    raise exception 'Seat limit must be at least 1';
  end if;

  insert into public.organizations (name, seat_limit)
  values (trim(p_org_name), p_seat_limit)
  returning id into new_org_id;

  select id into leader_id from auth.users
  where email = lower(trim(p_leader_email))
  limit 1;

  if leader_id is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (new_org_id, leader_id, 'owner')
    on conflict (organization_id, user_id) do update set role = 'owner';
    return jsonb_build_object(
      'organization_id', new_org_id,
      'leader_added', true,
      'invite_link', null
    );
  else
    return jsonb_build_object(
      'organization_id', new_org_id,
      'leader_added', false,
      'leader_email', lower(trim(p_leader_email))
    );
  end if;
end;
$$;

grant execute on function public.admin_create_organization(text, int, text) to service_role;
