-- Store AI-assisted giveaway details so the mobile app can render cleaner cards
-- without calling AI from the client.

alter table public.opportunities
  add column if not exists clean_summary text,
  add column if not exists prize_description text,
  add column if not exists eligibility text,
  add column if not exists quality_score numeric,
  add column if not exists risk_flags text[] not null default '{}',
  add column if not exists enrichment_method text not null default 'none',
  add column if not exists enrichment_reason text;

create index if not exists opportunities_quality_score_idx
  on public.opportunities (quality_score desc nulls last, published_at desc)
  where status = 'active';
