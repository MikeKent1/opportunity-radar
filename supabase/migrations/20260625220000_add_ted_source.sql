-- Allow public procurement opportunities from TED.

alter table public.opportunities
  drop constraint if exists opportunities_source_check;

alter table public.opportunities
  add constraint opportunities_source_check
  check (
    source in (
      'kingsumo',
      'gamerpower',
      'epicgames',
      'freetogame',
      'cheapshark',
      'eufunding',
      'ted',
      'grants'
    )
  );
