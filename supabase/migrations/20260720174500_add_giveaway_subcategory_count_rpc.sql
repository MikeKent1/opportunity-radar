-- Return eligible giveaway subcategory counts without loading every giveaway row.

create or replace function public.get_eligible_giveaway_subcategory_counts(
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
      ('cash'),
      ('trip'),
      ('gift_card'),
      ('hardware'),
      ('game'),
      ('software'),
      ('in_game_item'),
      ('dlc'),
      ('other'),
      ('all')
    ) as value(subcategory_id)
  ),
  visible as (
    select o
    from public.opportunities o
    where o.status = 'active'
      and public.is_opportunity_visible_for_user(o, country_code, profile_type)
      and public.is_opportunity_in_feed(o, 'giveaways')
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
        or coalesce((visible.o).subcategory, 'other') = subcategories.subcategory_id
    ) as opportunity_count
  from subcategories
  left join visible on true
  group by subcategories.subcategory_id;
$$;

grant execute on function public.get_eligible_giveaway_subcategory_counts(text, text)
  to anon, authenticated;
