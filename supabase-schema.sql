-- Run this in Supabase SQL Editor once to create schema + RLS + realtime.

create table if not exists public.matchups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'New Matchup',
  our_team jsonb not null default '[]'::jsonb,
  enemy_team jsonb not null default '[]'::jsonb,
  enemy_total_spd int not null default 0,
  note text not null default '',
  result text not null default 'untested',
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists matchups_updated_at_idx on public.matchups(updated_at desc);

alter table public.matchups
  add column if not exists skill_order jsonb not null default '[null,null,null]'::jsonb;

alter table public.matchups
  add column if not exists our_pet text,
  add column if not exists enemy_pet text;

create table if not exists public.editors (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.editors e
    where lower(e.email) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;

alter table public.matchups enable row level security;
alter table public.editors enable row level security;

drop policy if exists "matchups read all" on public.matchups;
create policy "matchups read all" on public.matchups for select using (true);

drop policy if exists "matchups insert editor" on public.matchups;
create policy "matchups insert editor" on public.matchups
  for insert with check (public.is_editor());

drop policy if exists "matchups update editor" on public.matchups;
create policy "matchups update editor" on public.matchups
  for update using (public.is_editor()) with check (public.is_editor());

drop policy if exists "matchups delete editor" on public.matchups;
create policy "matchups delete editor" on public.matchups
  for delete using (public.is_editor());

drop policy if exists "editors read self" on public.editors;
create policy "editors read self" on public.editors
  for select using (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'matchups'
  ) then
    execute 'alter publication supabase_realtime add table public.matchups';
  end if;
end $$;

-- Seed editors (edit emails before running, or insert via dashboard)
-- insert into public.editors (email, note) values
--   ('you@example.com', 'admin'),
--   ('officer2@example.com', 'officer');
