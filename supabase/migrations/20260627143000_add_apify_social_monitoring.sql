-- Add MVP social monitoring tables for Instagram opportunities via Apify.

create table if not exists public.social_sources (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram',
  username text not null,
  display_name text,
  enabled boolean not null default true,
  category text not null default 'giveaways',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform, username)
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.social_sources(id) on delete cascade,
  platform_post_id text not null,
  post_url text not null,
  caption text not null default '',
  posted_at timestamptz,
  raw_data jsonb not null default '{}',
  ai_status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (source_id, platform_post_id),
  unique (post_url)
);

alter table public.opportunities
  add column if not exists source_type text not null default 'api',
  add column if not exists category text,
  add column if not exists subcategory text,
  add column if not exists participation_steps text[] not null default '{}',
  add column if not exists expires_at timestamptz,
  add column if not exists participation_url text;

-- Social sources can use dynamic usernames in opportunities.source.
alter table public.opportunities
  drop constraint if exists opportunities_source_check;

create index if not exists social_sources_enabled_platform_idx
  on public.social_sources (enabled, platform);

create index if not exists social_posts_source_posted_idx
  on public.social_posts (source_id, posted_at desc);

create index if not exists opportunities_source_type_idx
  on public.opportunities (source_type, published_at desc);

alter table public.social_sources enable row level security;
alter table public.social_posts enable row level security;

revoke insert, update, delete on public.social_sources from anon, authenticated;
revoke insert, update, delete on public.social_posts from anon, authenticated;
revoke select on public.social_sources from anon, authenticated;
revoke select on public.social_posts from anon, authenticated;

insert into public.social_sources (platform, username, display_name, category, enabled)
values
  ('instagram', 'mrbeast', 'MrBeast', 'giveaways', true),
  ('instagram', 'playstation', 'PlayStation', 'giveaways', true),
  ('instagram', 'razer', 'Razer', 'giveaways', true),
  ('instagram', 'corsair', 'Corsair', 'giveaways', true),
  ('instagram', 'xbox', 'Xbox', 'giveaways', true),
  ('instagram', 'nintendoamerica', 'Nintendo America', 'giveaways', true),
  ('instagram', 'logitechg', 'Logitech G', 'giveaways', true),
  ('instagram', 'steelseries', 'SteelSeries', 'giveaways', true)
on conflict (platform, username) do update
set
  display_name = excluded.display_name,
  category = excluded.category;
