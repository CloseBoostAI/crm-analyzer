-- Fix RLS recursion: organization_members policy references itself in a subquery,
-- which can cause infinite recursion and block users (especially those added as
-- owners after signup). Use SECURITY DEFINER function to break the cycle.
-- Run this in Supabase SQL Editor.

-- Function: returns org IDs the current user belongs to (bypasses RLS)
create or replace function public.user_organization_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid();
$$;

-- Drop and recreate organization_members policies to use the helper
drop policy if exists "Org members can view their org's members" on public.organization_members;
create policy "Org members can view their org's members"
  on public.organization_members for select
  using (organization_id in (select user_organization_ids()));

drop policy if exists "Org owners and admins can insert members" on public.organization_members;
create policy "Org owners and admins can insert members"
  on public.organization_members for insert
  with check (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Note: insert policy still uses self-ref; that's OK - we're inserting, not selecting.
-- The recursion issue is only when SELECTing. If insert policy causes issues, we can
-- add a helper for that too. For now, focus on SELECT.

-- Drop and recreate organizations policies to use the helper
drop policy if exists "Org members can view their org" on public.organizations;
create policy "Org members can view their org"
  on public.organizations for select
  using (id in (select user_organization_ids()));

drop policy if exists "Org owners can update their org" on public.organizations;
create policy "Org owners can update their org"
  on public.organizations for update
  using (
    id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- Pending invites: use helper for the org check
drop policy if exists "Org owners and admins can manage invites" on public.pending_invites;
create policy "Org owners and admins can manage invites"
  on public.pending_invites for all
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
