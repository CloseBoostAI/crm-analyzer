-- Dismissed Smart Task recommendations (synced per user across devices)
-- Run this in Supabase SQL Editor.

create table if not exists public.dismissed_recommendations (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

alter table public.dismissed_recommendations enable row level security;

drop policy if exists "Users can view own dismissed recommendations" on public.dismissed_recommendations;
create policy "Users can view own dismissed recommendations"
  on public.dismissed_recommendations for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own dismissed recommendations" on public.dismissed_recommendations;
create policy "Users can insert own dismissed recommendations"
  on public.dismissed_recommendations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own dismissed recommendations" on public.dismissed_recommendations;
create policy "Users can update own dismissed recommendations"
  on public.dismissed_recommendations for update
  using (auth.uid() = user_id);
