-- Backfill deal_id on inbound_emails where sender_email matches a deal's contact email
-- Run in Supabase SQL Editor to link past emails to deals for Activity tab
-- Safe to run multiple times (only updates rows where deal_id is null or mismatched)

update public.inbound_emails ie
set deal_id = d.id,
    deal_name = d.name
from public.deals d
join public.organization_members om on om.user_id = d.user_id
where ie.organization_id = om.organization_id
  and lower(trim(ie.sender_email)) = lower(trim(d.email))
  and d.email is not null
  and trim(d.email) != ''
  and (ie.deal_id is null or ie.deal_id != d.id);
