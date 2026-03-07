-- Minimal storage for OAuth email status (acknowledged/replied)
-- Run after supabase-migrations-email-connections.sql

create table if not exists public.email_status (
  connection_id uuid not null references public.email_connections(id) on delete cascade,
  message_id text not null,
  status text not null check (status in ('pending', 'acknowledged', 'replied')),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (connection_id, message_id)
);

create index if not exists idx_email_status_org on public.email_status(organization_id);

alter table public.email_status enable row level security;

-- Org members can view status for their org
create policy "Org members can view email status"
  on public.email_status for select
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Org owners/admins can insert/update
create policy "Org owners and admins can manage email status"
  on public.email_status for all
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
