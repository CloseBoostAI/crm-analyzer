-- Extend inbound_emails for OAuth-synced emails
-- Run after supabase-migrations-email-connections.sql

-- Add columns for OAuth sync
alter table public.inbound_emails
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists connection_id uuid references public.email_connections(id) on delete set null,
  add column if not exists message_id text,
  add column if not exists thread_id text;

-- Make organization_id nullable for user-scoped OAuth emails (we'll still set it when we know the org)
-- Actually keep it not null - we always have org from user membership
-- Add unique constraint for dedupe (message_id + connection_id)
create unique index if not exists idx_inbound_emails_message_connection
  on public.inbound_emails(connection_id, message_id)
  where connection_id is not null and message_id is not null;

create index if not exists idx_inbound_emails_user on public.inbound_emails(user_id);
create index if not exists idx_inbound_emails_connection on public.inbound_emails(connection_id);

-- Update RLS: users can view emails where they are the user_id OR they're in the org
drop policy if exists "Org members can view inbound emails" on public.inbound_emails;
create policy "Users can view inbound emails"
  on public.inbound_emails for select
  using (
    user_id = auth.uid()
    or organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );
