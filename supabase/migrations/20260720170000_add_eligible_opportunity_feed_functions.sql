-- Count and page opportunities after applying the same eligibility rules used by the app.

create or replace function public.is_opportunity_visible_for_user(
  opportunity public.opportunities,
  country_code text default null,
  profile_type text default null
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select
      upper(nullif(country_code, '')) as country,
      lower(nullif(profile_type, '')) as profile
  )
  select
    not (coalesce(opportunity.risk_flags, '{}') && array['local_use_reward', 'region_limited'])
    and not (
      coalesce(opportunity.excluded_countries, '{}') <> '{}'
      and (select country from normalized) is not null
      and (select country from normalized) <> 'WORLDWIDE'
      and (select country from normalized) = any (
        array(select upper(value) from unnest(coalesce(opportunity.excluded_countries, '{}')) as value)
      )
    )
    and (
      (select country from normalized) is null
      or (select country from normalized) = 'WORLDWIDE'
      or coalesce(opportunity.eligible_countries, '{}') = '{}'
      or 'WORLDWIDE' = any (
        array(select upper(value) from unnest(coalesce(opportunity.eligible_countries, '{}')) as value)
      )
      or (select country from normalized) = any (
        array(select upper(value) from unnest(coalesce(opportunity.eligible_countries, '{}')) as value)
      )
    )
    and (
      (select country from normalized) is null
      or (select country from normalized) = 'WORLDWIDE'
      or coalesce(opportunity.eligible_regions, '{}') = '{}'
      or 'WORLDWIDE' = any (
        array(select upper(value) from unnest(coalesce(opportunity.eligible_regions, '{}')) as value)
      )
      or (
        'EU' = any (
          array(select upper(value) from unnest(coalesce(opportunity.eligible_regions, '{}')) as value)
        )
        and (select country from normalized) = any (
          array[
            'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
            'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'
          ]::text[]
        )
      )
    )
    and (
      coalesce(opportunity.audience_tags, '{}') = '{}'
      or 'individual' = any (
        array(select lower(value) from unnest(coalesce(opportunity.audience_tags, '{}')) as value)
      )
      or (select profile from normalized) is null
      or (select profile from normalized) = any (
        array(select lower(value) from unnest(coalesce(opportunity.audience_tags, '{}')) as value)
      )
    )
    and not (
      coalesce(opportunity.eligibility_flags, '{}') && array['invite_only', 'employees_only', 'members_only']
    )
    and not (
      'students_only' = any(coalesce(opportunity.eligibility_flags, '{}'))
      and coalesce((select profile from normalized), '') not in ('student')
    )
    and not (
      'nonprofits_only' = any(coalesce(opportunity.eligibility_flags, '{}'))
      and coalesce((select profile from normalized), '') not in ('nonprofit')
    )
    and not (
      'companies_only' = any(coalesce(opportunity.eligibility_flags, '{}'))
      and coalesce((select profile from normalized), '') not in ('company', 'startup')
    )
    and not (
      'government_only' = any(coalesce(opportunity.eligibility_flags, '{}'))
      and coalesce((select profile from normalized), '') not in ('government')
    )
    and not (
      'tribal_organizations_only' = any(coalesce(opportunity.eligibility_flags, '{}'))
      and coalesce((select profile from normalized), '') not in ('tribal_organization')
    )
    and not (
      'research_institutions_only' = any(coalesce(opportunity.eligibility_flags, '{}'))
      and coalesce((select profile from normalized), '') not in ('student', 'nonprofit')
    );
$$;

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
  );
$$;

create or replace function public.get_eligible_opportunity_counts(
  country_code text default null,
  profile_type text default null
)
returns table (
  all_count bigint,
  giveaways_count bigint,
  freetoplay_count bigint,
  launches_count bigint,
  competitions_count bigint,
  feeds_count bigint,
  community_count bigint,
  grants_count bigint,
  tenders_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with visible as (
    select o
    from public.opportunities o
    where o.status = 'active'
      and public.is_opportunity_visible_for_user(o, country_code, profile_type)
      and not exists (
        select 1
        from public.hidden_opportunities h
        where h.opportunity_id = o.id
          and h.user_id = auth.uid()
      )
  )
  select
    count(*) as all_count,
    count(*) filter (where public.is_opportunity_in_feed(visible.o, 'giveaways')) as giveaways_count,
    count(*) filter (where public.is_opportunity_in_feed(visible.o, 'freetoplay')) as freetoplay_count,
    count(*) filter (where public.is_opportunity_in_feed(visible.o, 'launches')) as launches_count,
    count(*) filter (where public.is_opportunity_in_feed(visible.o, 'competitions')) as competitions_count,
    count(*) filter (where public.is_opportunity_in_feed(visible.o, 'feeds')) as feeds_count,
    count(*) filter (where public.is_opportunity_in_feed(visible.o, 'community')) as community_count,
    count(*) filter (where public.is_opportunity_in_feed(visible.o, 'grants')) as grants_count,
    count(*) filter (where public.is_opportunity_in_feed(visible.o, 'tenders')) as tenders_count
  from visible;
$$;

create or replace function public.get_eligible_opportunities(
  country_code text default null,
  profile_type text default null,
  feed_filter text default 'all',
  feed_subcategory text default null,
  page_limit integer default 15,
  page_offset integer default 0
)
returns setof public.opportunities
language sql
stable
security invoker
set search_path = public
as $$
  select o.*
  from public.opportunities o
  where o.status = 'active'
    and public.is_opportunity_visible_for_user(o, country_code, profile_type)
    and public.is_opportunity_in_feed(o, feed_filter, feed_subcategory)
    and not exists (
      select 1
      from public.hidden_opportunities h
      where h.opportunity_id = o.id
        and h.user_id = auth.uid()
    )
  order by o.published_at desc
  limit greatest(0, least(coalesce(page_limit, 15), 100))
  offset greatest(0, coalesce(page_offset, 0));
$$;

grant execute on function public.is_opportunity_visible_for_user(public.opportunities, text, text) to anon, authenticated;
grant execute on function public.is_opportunity_in_feed(public.opportunities, text, text) to anon, authenticated;
grant execute on function public.get_eligible_opportunity_counts(text, text) to anon, authenticated;
grant execute on function public.get_eligible_opportunities(text, text, text, text, integer, integer) to anon, authenticated;
