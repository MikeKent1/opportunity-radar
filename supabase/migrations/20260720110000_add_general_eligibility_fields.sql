-- General eligibility fields used by all opportunity types, not only giveaways.

alter table public.opportunities
  add column if not exists excluded_countries text[] not null default '{}',
  add column if not exists eligible_regions text[] not null default '{}',
  add column if not exists audience_tags text[] not null default '{}',
  add column if not exists eligibility_flags text[] not null default '{}',
  add column if not exists minimum_age integer;

create index if not exists opportunities_excluded_countries_idx
  on public.opportunities using gin (excluded_countries)
  where status = 'active';

create index if not exists opportunities_eligible_regions_idx
  on public.opportunities using gin (eligible_regions)
  where status = 'active';

create index if not exists opportunities_audience_tags_idx
  on public.opportunities using gin (audience_tags)
  where status = 'active';

create index if not exists opportunities_eligibility_flags_idx
  on public.opportunities using gin (eligibility_flags)
  where status = 'active';
