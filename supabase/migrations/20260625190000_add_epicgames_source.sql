-- Allow current Epic Games Store giveaways as an opportunity source.

alter table public.opportunities
  drop constraint if exists opportunities_source_check;

alter table public.opportunities
  add constraint opportunities_source_check
  check (source in ('kingsumo', 'gamerpower', 'epicgames', 'grants'));
