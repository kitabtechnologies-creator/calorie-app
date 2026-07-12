-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  age int not null,
  sex text not null check (sex in ('female','male')),
  height_cm numeric not null,
  weight_kg numeric not null,
  goal text not null check (goal in ('lose','maintain','gain')),
  activity text not null check (activity in ('sedentary','light','moderate','active','very_active')),
  target_calories int not null,
  target_protein_g int not null,
  target_carbs_g int not null,
  target_fat_g int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  log_date date not null default (now()::date),
  name text not null,
  source text not null check (source in ('ai_photo','manual')),
  calories numeric not null,
  carbs_g numeric not null default 0,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  health_score numeric,
  accuracy numeric,
  recommendation text,
  foods jsonb,
  created_at timestamptz not null default now()
);

create index if not exists logs_user_date_idx on public.logs (user_id, log_date);

alter table public.profiles enable row level security;
alter table public.logs enable row level security;

create policy "profiles are owned by the user" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "logs are owned by the user" on public.logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
