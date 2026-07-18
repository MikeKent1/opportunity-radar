-- Separate ordinary listing limitations from actual risk flags.

alter table public.opportunities
  add column if not exists quality_notes text[] not null default '{}';
