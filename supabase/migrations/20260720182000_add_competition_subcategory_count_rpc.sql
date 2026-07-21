-- Add server-side Competition subcategory filters and counts.

create or replace function public.is_opportunity_in_feed(
  opportunity public.opportunities,
  feed_filter text default 'all',
  feed_subcategory text default null
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case coalesce(feed_filter, 'all')
    when 'all' then true
    when 'giveaways' then (
      opportunity.source_type = 'social'
      or opportunity.category = 'giveaways'
      or opportunity.source in ('gamerpower', 'epicgames', 'cheapshark', 'kingsumo')
    )
    when 'freetoplay' then opportunity.source = 'freetogame'
    when 'launches' then opportunity.source = 'producthunt'
    when 'competitions' then opportunity.source = 'kaggle'
    when 'feeds' then opportunity.source = 'rss'
    when 'community' then opportunity.source = 'reddit'
    when 'grants' then opportunity.source in ('grants', 'eufunding')
    when 'tenders' then opportunity.source = 'ted'
    else false
  end
  and (
    coalesce(feed_filter, 'all') <> 'giveaways'
    or feed_subcategory is null
    or feed_subcategory = ''
    or feed_subcategory = 'all'
    or opportunity.subcategory = feed_subcategory
  )
  and (
    coalesce(feed_filter, 'all') <> 'freetoplay'
    or feed_subcategory is null
    or feed_subcategory = ''
    or feed_subcategory = 'all'
    or (
      case feed_subcategory
        when 'mmorpg' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'mmorpg'
        )
        when 'shooter' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'shooter'
        )
        when 'strategy' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'strategy'
        )
        when 'card' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'card game'
        )
        when 'moba' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'moba'
        )
        when 'battle_royale' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'battle royale'
        )
        when 'sports' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'sports'
        )
        when 'browser' then exists (
          select 1
          from unnest(coalesce(opportunity.tags, '{}')) as tag
          where lower(tag) like '%web browser%'
        )
        else false
      end
    )
  )
  and (
    coalesce(feed_filter, 'all') <> 'competitions'
    or feed_subcategory is null
    or feed_subcategory = ''
    or feed_subcategory = 'all'
    or (
      case feed_subcategory
        when 'cash_prize' then coalesce(opportunity.amount, 0) > 0
        when 'featured' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'featured'
        )
        when 'getting_started' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'getting started'
        )
        when 'knowledge' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'knowledge'
        )
        when 'playground' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'playground'
        )
        when 'swag' then exists (
          select 1 from unnest(coalesce(opportunity.tags, '{}')) as tag where lower(tag) = 'swag'
        )
        else false
      end
    )
  );
$$;

create or replace function public.get_eligible_competition_subcategory_counts(
  country_code text default null,
  profile_type text default null
)
returns table (
  subcategory_id text,
  opportunity_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with subcategories as (
    select *
    from (values
      ('cash_prize'),
      ('featured'),
      ('getting_started'),
      ('knowledge'),
      ('playground'),
      ('swag'),
      ('all')
    ) as value(subcategory_id)
  ),
  visible as (
    select o
    from public.opportunities o
    where o.status = 'active'
      and public.is_opportunity_visible_for_user(o, country_code, profile_type)
      and public.is_opportunity_in_feed(o, 'competitions')
      and not exists (
        select 1
        from public.hidden_opportunities h
        where h.opportunity_id = o.id
          and h.user_id = auth.uid()
      )
  )
  select
    subcategories.subcategory_id,
    count(visible.o) filter (
      where subcategories.subcategory_id = 'all'
        or public.is_opportunity_in_feed(visible.o, 'competitions', subcategories.subcategory_id)
    ) as opportunity_count
  from subcategories
  left join visible on true
  group by subcategories.subcategory_id;
$$;

grant execute on function public.is_opportunity_in_feed(public.opportunities, text, text)
  to anon, authenticated;

grant execute on function public.get_eligible_competition_subcategory_counts(text, text)
  to anon, authenticated;
