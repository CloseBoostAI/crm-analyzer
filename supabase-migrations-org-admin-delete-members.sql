-- Allow org admins (in addition to owners) to remove members from the organization.
-- Run this in Supabase SQL Editor after supabase-migrations-org.sql and supabase-migrations-rls-fix.sql.

drop policy if exists "Org owners can delete members (except themselves)" on public.organization_members;
create policy "Org owners and admins can delete members (except themselves)"
  on public.organization_members for delete
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
    and user_id != auth.uid()
  );
