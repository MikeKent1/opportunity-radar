-- Initial Opportunity Radar database migration.
-- Applied remotely with `npm run db:push`.

create extension if not exists pgcrypto;

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  source text not null check (source in ('kingsumo', 'grants')),
  title text not null,
  organization text not null default '',
  summary text not null default '',
  url text not null,
  image_url text,
  amount numeric,
  currency text not null default 'USD',
  deadline timestamptz,
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'closed', 'draft')),
  published_at timestamptz not null default now(),
  raw_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists opportunities_status_published_idx
  on public.opportunities (status, published_at desc);

alter table public.opportunities enable row level security;

drop policy if exists "Public can read active opportunities" on public.opportunities;
create policy "Public can read active opportunities"
  on public.opportunities
  for select
  to anon, authenticated
  using (status = 'active');

-- Writes happen only from the Edge Function with the service-role key.
revoke insert, update, delete on public.opportunities from anon, authenticated;
grant select on public.opportunities to anon, authenticated;

-- Enable Realtime updates for the app feed.
do $$
begin
  alter publication supabase_realtime add table public.opportunities;
exception
  when duplicate_object then null;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists opportunities_touch_updated_at on public.opportunities;
create trigger opportunities_touch_updated_at
before update on public.opportunities
for each row execute function public.touch_updated_at();
