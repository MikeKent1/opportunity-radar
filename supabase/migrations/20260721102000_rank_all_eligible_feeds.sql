-- Rank every eligible feed page by quality/risk, not only giveaways.

create or replace function public.get_opportunity_rank_score(
  opportunity public.opportunities
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select
    least(1, greatest(0, coalesce(opportunity.quality_score, 0.65)))
    + case when nullif(opportunity.clean_summary, '') is not null then 0.05 else 0 end
    + case when nullif(opportunity.prize_description, '') is not null then 0.05 else 0 end
    + case when nullif(opportunity.eligibility, '') is not null then 0.03 else 0 end
    + case when opportunity.deadline is not null then 0.03 else 0 end
    + case when nullif(coalesce(opportunity.participation_url, opportunity.url), '') is not null then 0.02 else 0 end
    - case when coalesce(opportunity.risk_flags, '{}') && array['local_use_reward', 'region_limited'] then 0.7 else 0 end
    - case when 'suspicious_claims' = any(coalesce(opportunity.risk_flags, '{}')) then 0.6 else 0 end
    - case when 'crypto_spam' = any(coalesce(opportunity.risk_flags, '{}')) then 0.6 else 0 end
    - case when 'broken_text' = any(coalesce(opportunity.risk_flags, '{}')) then 0.4 else 0 end
    - case when 'unclear_prize' = any(coalesce(opportunity.risk_flags, '{}')) then 0.3 else 0 end
    - case when 'misleading_value' = any(coalesce(opportunity.risk_flags, '{}')) then 0.25 else 0 end
    - case when 'engagement_bait' = any(coalesce(opportunity.risk_flags, '{}')) then 0.25 else 0 end
    - case when 'unclear_entry_path' = any(coalesce(opportunity.risk_flags, '{}')) then 0.2 else 0 end
    - case when 'low_value' = any(coalesce(opportunity.risk_flags, '{}')) then 0.2 else 0 end
    - case when 'eligibility_unclear' = any(coalesce(opportunity.risk_flags, '{}')) then 0.18 else 0 end
    - case when 'location_unclear' = any(coalesce(opportunity.risk_flags, '{}')) then 0.18 else 0 end
    - case when 'no_deadline' = any(coalesce(opportunity.risk_flags, '{}')) then 0.1 else 0 end;
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

grant execute on function public.get_opportunity_rank_score(public.opportunities)
  to anon, authenticated;
grant execute on function public.get_eligible_opportunities(text, text, text, text, integer, integer)
  to anon, authenticated;
