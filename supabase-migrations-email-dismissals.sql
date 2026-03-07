-- Per-user dismissed/hidden emails (removes from Client Inbox view)
-- Run after supabase-migrations-email-status.sql

create table if not exists public.email_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  email_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, email_id)
);

create index if not exists idx_email_dismissals_user on public.email_dismissals(user_id);

alter table public.email_dismissals enable row level security;

create policy "Users can manage own dismissals"
  on public.email_dismissals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
