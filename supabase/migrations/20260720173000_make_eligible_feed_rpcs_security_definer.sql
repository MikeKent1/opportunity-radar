-- The feed RPCs need to check hidden_opportunities while still returning only
-- active public opportunities. Run them as definers so anon/authenticated users
-- do not need direct read access to hidden_opportunities.

alter function public.get_eligible_opportunity_counts(text, text)
  security definer;

alter function public.get_eligible_opportunities(text, text, text, text, integer, integer)
  security definer;
