-- Keep server-side giveaway pages in the same order the app uses locally.
-- This prevents load-more pages from being re-sorted above already visible cards.

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
    case
      when feed_filter = 'giveaways' then
        coalesce(o.quality_score, 0)
        + case when o.clean_summary is not null and o.clean_summary <> '' then 0.05 else 0 end
        + case when o.prize_description is not null and o.prize_description <> '' then 0.05 else 0 end
        + case when o.eligibility is not null and o.eligibility <> '' then 0.03 else 0 end
        - case when coalesce(o.risk_flags, '{}') && array['local_use_reward', 'region_limited'] then 0.7 else 0 end
        - case when 'unclear_reward' = any(coalesce(o.risk_flags, '{}')) then 0.3 else 0 end
        - case when 'low_value' = any(coalesce(o.risk_flags, '{}')) then 0.2 else 0 end
        - case when 'no_deadline' = any(coalesce(o.risk_flags, '{}')) then 0.1 else 0 end
      else null
    end desc nulls last,
    case
      when feed_filter = 'giveaways' then o.deadline
      else null
    end asc nulls last,
    o.published_at desc
  limit greatest(0, least(coalesce(page_limit, 15), 100))
  offset greatest(0, coalesce(page_offset, 0));
$$;

grant execute on function public.get_eligible_opportunities(text, text, text, text, integer, integer)
  to anon, authenticated;
