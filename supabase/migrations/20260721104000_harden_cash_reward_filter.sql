-- Make Giveaways > Cash require a clean direct-cash reward, not retail values,
-- hotel rates, local events, or unclear prizes that merely mention a money amount.

create or replace function public.has_strong_cash_reward(
  opportunity public.opportunities
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select lower(
      concat_ws(
        ' ',
        opportunity.title,
        opportunity.clean_summary,
        opportunity.prize_description,
        opportunity.eligibility,
        opportunity.summary,
        opportunity.organization,
        opportunity.source,
        array_to_string(coalesce(opportunity.tags, '{}'), ' ')
      )
    ) as text
  )
  select coalesce(opportunity.subcategory, 'other') = 'cash'
    and not (
      coalesce(opportunity.risk_flags, '{}')
        && array['local_use_reward', 'region_limited', 'unclear_prize', 'broken_text', 'misleading_value']
    )
    and not (
      (select text from normalized) ~* '\m(cash rates?|rates? (currently )?starts? at|starting at|retail value|valued at|value of|worth|msrp|hotel rates?|points per night|book(ing)? (it )?with points|honors points)\M'
    )
    and (
      (select text from normalized) ~* '\m(win|wins|winner|winners|grand prize|prize|get|gets|receive|earn|claim|score)\M.{0,45}([$]\s?[0-9]{2,}([,.][0-9]{3})*(\.[0-9]{2})?|[$]\s?[0-9]+(\.[0-9]+)?\s?k\M|\m(usd|eur|gbp)\M\s?[0-9]{2,}([,.][0-9]{3})*(\.[0-9]{2})?|\m[0-9]{2,}([,.][0-9]{3})*(\.[0-9]{2})?\s?(usd|eur|gbp|dollars?|euros?|pounds?)\M)'
      or (select text from normalized) ~* '([$]\s?[0-9]{2,}([,.][0-9]{3})*(\.[0-9]{2})?|[$]\s?[0-9]+(\.[0-9]+)?\s?k\M|\m(usd|eur|gbp)\M\s?[0-9]{2,}([,.][0-9]{3})*(\.[0-9]{2})?|\m[0-9]{2,}([,.][0-9]{3})*(\.[0-9]{2})?\s?(usd|eur|gbp|dollars?|euros?|pounds?)\M).{0,45}\m(winner|winners|grand prize|prize)\M'
      or (select text from normalized) ~* '\m(win|wins|winner|winners|get|gets|receive|earn|claim|score)\M.{0,45}\m(cash|money|paypal|venmo|cashapp|payout|payouts|prize money|award money|reward money)\M'
      or (select text from normalized) ~* '\m(cash prizes?|cash rewards?|cash payout|paypal|venmo|cashapp|bank transfer|direct deposit|wire transfer|prepaid mastercard rewards?|prize money|award money|reward money|scholarship|stipend|usd prize)\M'
    )
    and (
      (select text from normalized) ~* '\m(win|wins|winner|winners|get|gets|receive|earn|claim|score)\M.{0,45}\m(cash|money|paypal|venmo|cashapp|payout|payouts|prize money|award money|reward money)\M'
      or (select text from normalized) ~* '\m(cash prizes?|cash rewards?|cash payout|paypal|venmo|cashapp|bank transfer|direct deposit|wire transfer|prepaid mastercard rewards?|prize money|award money|reward money|scholarship|stipend|usd prize)\M'
      or not (
        (select text from normalized) ~* '\m(setup|hardware|football tackle dummy|watercraft|vehicle|trip|travel package|hotel stay|flight|vacation|local pickup|in-store only|class pass|admission tickets?)\M'
      )
    );
$$;

grant execute on function public.has_strong_cash_reward(public.opportunities)
  to anon, authenticated;
