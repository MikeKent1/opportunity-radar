-- Keep RSS imports available for audits, but remove them from the user-facing All feed.

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
security definer
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
    count(*) filter (where (visible.o).source <> 'rss') as all_count,
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
security definer
set search_path = public
as $$
  select o.*
  from public.opportunities o
  where o.status = 'active'
    and public.is_opportunity_visible_for_user(o, country_code, profile_type)
    and public.is_opportunity_in_feed(o, feed_filter, feed_subcategory)
    and (coalesce(feed_filter, 'all') <> 'all' or o.source <> 'rss')
    and not exists (
      select 1
      from public.hidden_opportunities h
      where h.opportunity_id = o.id
        and h.user_id = auth.uid()
    )
  order by
    case
      when feed_filter = 'giveaways' and feed_subcategory = 'cash'
        then o.amount
      else null
    end desc nulls last,
    public.get_opportunity_rank_score(o) desc,
    o.deadline asc nulls last,
    o.published_at desc
  limit greatest(0, least(coalesce(page_limit, 15), 100))
  offset greatest(0, coalesce(page_offset, 0));
$$;

grant execute on function public.get_eligible_opportunity_counts(text, text)
  to anon, authenticated;
grant execute on function public.get_eligible_opportunities(text, text, text, text, integer, integer)
  to anon, authenticated;
