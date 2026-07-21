-- Some generic sweepstakes pages list many giveaways together. Older imports could
-- capture neighboring giveaway titles in the summary, which confused audits and UI text.

update public.opportunities
set
  clean_summary = title,
  prize_description = coalesce(nullif(prize_description, ''), title),
  quality_notes = (
    select array(
      select distinct note
      from unnest(
        coalesce(public.opportunities.quality_notes, '{}')
        || array['cleaned_contaminated_summary']
      ) as note
    )
  ),
  updated_at = now()
where status = 'active'
  and source = 'sweepstakes_web'
  and source_type = 'web'
  and clean_summary ~* 'giveaway.{1,220}giveaway'
  and (
    raw_data ->> 'sourceLabel' = 'The Freebie Guy Social Giveaways'
    or raw_data ->> 'sourceLabel' = 'The Freebie Guy Daily Sweepstakes'
  );
