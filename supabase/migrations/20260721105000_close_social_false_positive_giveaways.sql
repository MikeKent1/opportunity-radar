-- Remove social posts that were imported as giveaways even though enrichment found no prize.

update public.opportunities
set
  status = 'closed',
  category = 'other',
  subcategory = 'other',
  needs_review = true,
  risk_flags = (
    select array(
      select distinct flag
      from unnest(
        coalesce(public.opportunities.risk_flags, '{}')
        || array['unclear_prize', 'unclear_entry_path']
      ) as flag
    )
  ),
  quality_notes = (
    select array(
      select distinct note
      from unnest(
        coalesce(public.opportunities.quality_notes, '{}')
        || array['closed_false_positive_giveaway']
      ) as note
    )
  ),
  classification_method = 'cleanup',
  classification_confidence = 0.95,
  classification_reason = 'Closed because enrichment found no giveaway prize or entry path.',
  updated_at = now()
where status = 'active'
  and category = 'giveaways'
  and source_type = 'social'
  and (
    lower(coalesce(prize_description, '')) like 'no giveaway prize stated%'
    or lower(coalesce(clean_summary, '')) like '%no giveaway prize%'
  );
