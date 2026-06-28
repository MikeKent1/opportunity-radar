-- Add per-user saved opportunities for authenticated users.

create table if not exists public.saved_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create index if not exists saved_opportunities_user_created_idx
  on public.saved_opportunities (user_id, created_at desc);

create index if not exists saved_opportunities_opportunity_idx
  on public.saved_opportunities (opportunity_id);

alter table public.saved_opportunities enable row level security;

drop policy if exists "Users can read their saved opportunities" on public.saved_opportunities;
create policy "Users can read their saved opportunities"
  on public.saved_opportunities
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can save opportunities" on public.saved_opportunities;
create policy "Users can save opportunities"
  on public.saved_opportunities
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their saved opportunities" on public.saved_opportunities;
create policy "Users can remove their saved opportunities"
  on public.saved_opportunities
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.saved_opportunities from anon;
grant select, insert, delete on public.saved_opportunities to authenticated;
