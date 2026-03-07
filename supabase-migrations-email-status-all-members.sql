-- Allow all org members to update email status (not just owners/admins)
-- Run after supabase-migrations-email-status.sql

drop policy if exists "Org owners and admins can manage email status" on public.email_status;
create policy "Org members can manage email status"
  on public.email_status for all
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Also allow all org members to update inbound_emails (webhook emails)
drop policy if exists "Org owners and admins can update inbound emails" on public.inbound_emails;
create policy "Org members can update inbound emails"
  on public.inbound_emails for update
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );
