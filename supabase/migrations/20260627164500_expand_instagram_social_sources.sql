-- Expand curated Instagram monitoring sources in measured batches.

insert into public.social_sources (platform, username, display_name, category, enabled)
values
  -- Gaming hardware and peripherals.
  ('instagram', 'alienware', 'Alienware', 'hardware', true),
  ('instagram', 'asusrog', 'ROG Global', 'hardware', true),
  ('instagram', 'msigaming', 'MSI Gaming', 'hardware', true),
  ('instagram', 'nzxt', 'NZXT', 'hardware', true),
  ('instagram', 'hyperx', 'HyperX', 'hardware', true),
  ('instagram', 'elgato', 'Elgato', 'hardware', true),
  ('instagram', 'secretlab', 'Secretlab', 'hardware', true),
  ('instagram', 'scufgaming', 'SCUF Gaming', 'hardware', true),
  ('instagram', 'turtlebeach', 'Turtle Beach', 'hardware', true),
  ('instagram', 'astrogaming', 'ASTRO Gaming', 'hardware', true),

  -- Game publishers and platforms that occasionally run promos or giveaways.
  ('instagram', 'bethesda', 'Bethesda', 'gaming', true),
  ('instagram', 'ubisoft', 'Ubisoft', 'gaming', true),
  ('instagram', 'ea', 'Electronic Arts', 'gaming', true),
  ('instagram', 'riotgames', 'Riot Games', 'gaming', true),
  ('instagram', 'blizzard', 'Blizzard Entertainment', 'gaming', true),
  ('instagram', '2k', '2K', 'gaming', true),
  ('instagram', 'bandainamcous', 'Bandai Namco US', 'gaming', true),
  ('instagram', 'devolverdigital', 'Devolver Digital', 'gaming', true),

  -- Cash / sweepstakes candidates. Keep this batch small and review yield.
  ('instagram', 'cashapp', 'Cash App', 'cash_candidate', true),
  ('instagram', 'venmo', 'Venmo', 'cash_candidate', true),
  ('instagram', 'pch', 'Publishers Clearing House', 'cash_candidate', true),
  ('instagram', 'jackpocket', 'Jackpocket', 'cash_candidate', true)
on conflict (platform, username) do update
set
  display_name = excluded.display_name,
  category = excluded.category,
  enabled = excluded.enabled;

create or replace view public.social_source_performance as
select
  sources.id,
  sources.platform,
  sources.username,
  sources.display_name,
  sources.category,
  sources.enabled,
  sources.last_checked_at,
  count(posts.id) as posts_saved,
  count(posts.id) filter (where posts.ai_status = 'rule_giveaway') as giveaway_posts,
  count(opportunities.id) as imported_opportunities,
  max(posts.posted_at) as latest_posted_at
from public.social_sources sources
left join public.social_posts posts
  on posts.source_id = sources.id
left join public.opportunities opportunities
  on opportunities.source_type = 'social'
  and opportunities.source = sources.username
  and opportunities.external_id = ('instagram:' || posts.platform_post_id)
group by
  sources.id,
  sources.platform,
  sources.username,
  sources.display_name,
  sources.category,
  sources.enabled,
  sources.last_checked_at;
