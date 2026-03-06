-- Organizations & Team (billing, invites, seats)
-- Run this in Supabase SQL Editor after the main schema

-- Profiles (for displaying member emails/names)
create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  email text,
  full_name text,
  updated_at timestamptz not null default now(),
  primary key (id)
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view all profiles"
  on public.profiles for select
  using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Organizations table (policies added after organization_members exists)
create table if not exists public.organizations (
  id uuid not null default gen_random_uuid(),
  name text not null default 'My Organization',
  created_by uuid references auth.users(id) on delete set null,
  seat_limit int not null default 1,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  primary key (id)
);

alter table public.organizations enable row level security;

-- Organization members (must exist before org policies that reference it)
create table if not exists public.organization_members (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (id),
  unique(organization_id, user_id)
);

alter table public.organization_members enable row level security;

drop policy if exists "Org members can view their org's members" on public.organization_members;
create policy "Org members can view their org's members"
  on public.organization_members for select
  using (
    organization_id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

drop policy if exists "Org owners and admins can insert members" on public.organization_members;
create policy "Org owners and admins can insert members"
  on public.organization_members for insert
  with check (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

drop policy if exists "Org owners can delete members (except themselves)" on public.organization_members;
create policy "Org owners can delete members (except themselves)"
  on public.organization_members for delete
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role = 'owner'
    )
    and user_id != auth.uid()
  );

-- Organization policies (require organization_members to exist)
drop policy if exists "Org members can view their org" on public.organizations;
create policy "Org members can view their org"
  on public.organizations for select
  using (
    id in (select organization_id from public.organization_members where user_id = auth.uid())
  );

drop policy if exists "Org owners can update their org" on public.organizations;
create policy "Org owners can update their org"
  on public.organizations for update
  using (
    id in (select organization_id from public.organization_members where user_id = auth.uid() and role = 'owner')
  );

-- Pending invites
create table if not exists public.pending_invites (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  primary key (id)
);

alter table public.pending_invites enable row level security;

drop policy if exists "Org owners and admins can manage invites" on public.pending_invites;
create policy "Org owners and admins can manage invites"
  on public.pending_invites for all
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Function to create org: bypasses RLS for initial insert
create or replace function public.create_organization(org_name text default 'My Organization')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.organizations (name, created_by, seat_limit)
  values (org_name, uid, 1)
  returning id into new_org_id;
  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, uid, 'owner');
  return new_org_id;
end;
$$;

grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.create_organization(text) to service_role;

-- Function to accept invite: adds user to org
create or replace function public.accept_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  uid uuid;
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
  insert into public.organization_members (organization_id, user_id, role)
  values (inv.organization_id, uid, 'member')
  on conflict (organization_id, user_id) do nothing;
  delete from public.pending_invites where id = inv.id;
  return inv.organization_id;
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.accept_invite(text) to service_role;

-- Function to get invite details by token (for signup page, no auth required)
create or replace function public.get_invite_by_token(invite_token text)
returns table(email text, org_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select pi.email, o.name
  from public.pending_invites pi
  join public.organizations o on o.id = pi.organization_id
  where pi.token = invite_token and pi.expires_at > now();
end;
$$;

grant execute on function public.get_invite_by_token(text) to anon;
grant execute on function public.get_invite_by_token(text) to authenticated;
