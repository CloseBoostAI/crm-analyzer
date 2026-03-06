-- Inbound emails: receive and acknowledge client emails sent to company
-- Run this in Supabase SQL Editor after supabase-migrations-org.sql

-- Add optional inbound email address to organizations (for routing)
alter table public.organizations
  add column if not exists inbound_email text;

-- Inbound emails table (stores emails received via SendGrid/Mailgun webhook)
create table if not exists public.inbound_emails (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sender_email text not null,
  sender_name text,
  to_email text not null,
  subject text not null default '',
  body_text text,
  body_html text,
  deal_id text,
  deal_name text,
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'replied')),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (id)
);

create index if not exists idx_inbound_emails_org on public.inbound_emails(organization_id);
create index if not exists idx_inbound_emails_sender on public.inbound_emails(sender_email);
create index if not exists idx_inbound_emails_status on public.inbound_emails(status);
create index if not exists idx_inbound_emails_received on public.inbound_emails(received_at desc);

alter table public.inbound_emails enable row level security;

-- Org members can view inbound emails for their org
create policy "Org members can view inbound emails"
  on public.inbound_emails for select
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Org owners/admins can update (acknowledge, mark replied)
create policy "Org owners and admins can update inbound emails"
  on public.inbound_emails for update
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- No insert policy for authenticated users. Webhook uses service_role which bypasses RLS.
