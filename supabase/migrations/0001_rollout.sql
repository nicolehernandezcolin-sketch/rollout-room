-- Rollout Room: each creator's private workspace, public media kits, and a daily cap on Claude requests.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

-- Everything in a creator's workspace (profile, plan, queue, vault, check-ins) is one row per item.
create table if not exists public.rollout_docs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.rollout_docs enable row level security;
drop policy if exists "Creators manage their own workspace" on public.rollout_docs;
create policy "Creators manage their own workspace" on public.rollout_docs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A creator's published media kit. Readable by anyone who has its code, through get_media_kit only,
-- so kits can't be listed or browsed.
create table if not exists public.media_kits (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  code text not null unique,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.media_kits enable row level security;
drop policy if exists "Creators manage their own kit" on public.media_kits;
create policy "Creators manage their own kit" on public.media_kits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.get_media_kit(kit_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select data from public.media_kits where code = kit_code limit 1;
$$;
revoke all on function public.get_media_kit(text) from public;
grant execute on function public.get_media_kit(text) to anon, authenticated;

-- Claude requests per creator per day. Only the server function (service role) reads or writes this.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create or replace function public.bump_ai_usage(uid uuid, max_per_day integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare used integer;
begin
  insert into public.ai_usage (user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into used;
  return used <= max_per_day;
end;
$$;
revoke all on function public.bump_ai_usage(uuid, integer) from public, anon, authenticated;
