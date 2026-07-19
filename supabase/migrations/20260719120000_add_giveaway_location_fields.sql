-- Store structured location hints from giveaway enrichment so the app can hide
-- country-mismatched and local-use rewards by default.

alter table public.opportunities
  add column if not exists eligible_countries text[] not null default '{}',
  add column if not exists localities text[] not null default '{}';

create index if not exists opportunities_eligible_countries_idx
  on public.opportunities using gin (eligible_countries)
  where status = 'active';

create index if not exists opportunities_localities_idx
  on public.opportunities using gin (localities)
  where status = 'active';
