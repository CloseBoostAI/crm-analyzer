-- Email connections: per-user OAuth connections (Gmail, Outlook)
-- Run after supabase-migrations-inbound-emails.sql

create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  email text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider, email)
);

create index if not exists idx_email_connections_user on public.email_connections(user_id);
create index if not exists idx_email_connections_org on public.email_connections(organization_id);

alter table public.email_connections enable row level security;

-- Users can view their own connections
create policy "Users can view own email connections"
  on public.email_connections for select
  using (auth.uid() = user_id);

-- Users can insert their own connections
create policy "Users can insert own email connections"
  on public.email_connections for insert
  with check (auth.uid() = user_id);

-- Users can update their own connections (token refresh)
create policy "Users can update own email connections"
  on public.email_connections for update
  using (auth.uid() = user_id);

-- Users can delete their own connections (disconnect)
create policy "Users can delete own email connections"
  on public.email_connections for delete
  using (auth.uid() = user_id);
