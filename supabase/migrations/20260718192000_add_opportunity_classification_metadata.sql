-- Track how giveaway subcategories were decided so ambiguous rewards can be audited.

alter table public.opportunities
  add column if not exists classification_method text not null default 'rules',
  add column if not exists classification_confidence numeric,
  add column if not exists classification_reason text,
  add column if not exists needs_review boolean not null default false;

create index if not exists opportunities_needs_review_idx
  on public.opportunities (needs_review, updated_at desc)
  where needs_review = true;
