-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- Deals table
create table if not exists public.deals (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  stage text not null default '',
  owner text not null default '',
  contact text not null default '',
  amount numeric not null default 0,
  contact_id text not null default '',
  notes text not null default '',
  close_date text not null default '',
  email text not null default '',
  company text not null default '',
  last_activity text not null default '',
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.deals enable row level security;

create policy "Users can view their own deals"
  on public.deals for select
  using (auth.uid() = user_id);

create policy "Users can insert their own deals"
  on public.deals for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own deals"
  on public.deals for update
  using (auth.uid() = user_id);

create policy "Users can delete their own deals"
  on public.deals for delete
  using (auth.uid() = user_id);

-- Customers table
create table if not exists public.customers (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  company text not null default '',
  last_contact text not null default '',
  status text not null default 'Lead',
  value numeric not null default 0,
  next_action text not null default '',
  customer_intent text not null default '',
  notes jsonb not null default '[]'::jsonb,
  interactions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.customers enable row level security;

create policy "Users can view their own customers"
  on public.customers for select
  using (auth.uid() = user_id);

create policy "Users can insert their own customers"
  on public.customers for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own customers"
  on public.customers for update
  using (auth.uid() = user_id);

create policy "Users can delete their own customers"
  on public.customers for delete
  using (auth.uid() = user_id);

-- Logs table
create table if not exists public.logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null default '',
  timestamp text not null default '',
  type text not null default '',
  notes text not null default '',
  outcome text not null default '',
  created_at timestamptz not null default now(),
  primary key (id)
);

alter table public.logs enable row level security;

create policy "Users can view their own logs"
  on public.logs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own logs"
  on public.logs for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own logs"
  on public.logs for delete
  using (auth.uid() = user_id);

-- Tasks table
create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  status text not null default 'NOT_STARTED',
  due_date bigint not null default 0,
  priority text not null default 'MEDIUM',
  associated_deal_id text,
  associated_deal_name text,
  assigned_to text not null default '',
  notes text,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

alter table public.tasks enable row level security;

create policy "Users can view their own tasks"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tasks"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
  on public.tasks for update
  using (auth.uid() = user_id);

create policy "Users can delete their own tasks"
  on public.tasks for delete
  using (auth.uid() = user_id);
