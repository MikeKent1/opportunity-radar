-- Allow curated Reddit posts as opportunity records.
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
      'producthunt',
      'kaggle',
      'rss',
      'reddit',
      'eufunding',
      'ted',
      'grants'
    )
  );
