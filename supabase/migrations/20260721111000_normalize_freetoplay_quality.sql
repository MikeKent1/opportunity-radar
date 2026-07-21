-- FreeToGame rows are playable game listings, not application/grant listings.
-- Normalize their quality metadata so the feed does not treat missing applicant
-- eligibility or monetary value as a defect.

update public.opportunities
set
  eligibility = 'Free-to-play game listing. Availability can depend on the game platform, store, and local region.',
  audience_tags = (
    select array(
      select distinct tag
      from unnest(coalesce(public.opportunities.audience_tags, '{}') || array['individual']) as tag
    )
  ),
  eligibility_flags = (
    select coalesce(array_agg(flag), '{}')
    from unnest(coalesce(public.opportunities.eligibility_flags, '{}')) as flag
    where flag not in ('eligibility_unclear', 'location_unclear')
  ),
  quality_score = greatest(
    coalesce(quality_score, 0),
    case
      when nullif(summary, '') is not null
        and nullif(image_url, '') is not null
        and nullif(url, '') is not null
        and coalesce(tags, '{}') <> '{}'
        then 0.72
      else 0.66
    end
  ),
  quality_notes = (
    select array(
      select distinct note
      from unnest(
        coalesce(public.opportunities.quality_notes, '{}')
        || array['free_to_play_game', 'official_source', 'platform_listed']
      ) as note
      where note not in ('thin_listing', 'eligibility_unclear', 'value_unclear', 'location_unclear')
    )
  ),
  enrichment_method = case
    when enrichment_method is null or enrichment_method in ('none', 'rules', 'ai_eligibility')
      then 'rules'
    else enrichment_method
  end,
  enrichment_reason = 'FreeToGame listing normalized as a playable free-to-play game opportunity.',
  updated_at = now()
where status = 'active'
  and source = 'freetogame';
