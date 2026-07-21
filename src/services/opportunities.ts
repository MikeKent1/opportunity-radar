import { demoOpportunities } from '../data/demoOpportunities';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { Opportunity } from '../types';

type LoadResult = {
  data: Opportunity[];
  feedVersion: string | null;
  notice: string | null;
};

type LoadOptions = {
  limit?: number;
  offset?: number;
  filter?: OpportunityFeedFilter;
  subcategory?: string;
  countryCode?: string | null;
  profileType?: string | null;
};

export type OpportunityFeedFilter =
  | 'all'
  | 'giveaways'
  | 'freetoplay'
  | 'launches'
  | 'competitions'
  | 'feeds'
  | 'community'
  | 'grants'
  | 'tenders';

export type OpportunityCounts = {
  all: number;
  giveaways: number;
  freetoplay: number;
  launches: number;
  competitions: number;
  feeds: number;
  community: number;
  grants: number;
  tenders: number;
};

type EligibleOpportunityCountsRow = {
  all_count: number | string | null;
  giveaways_count: number | string | null;
  freetoplay_count: number | string | null;
  launches_count: number | string | null;
  competitions_count: number | string | null;
  feeds_count: number | string | null;
  community_count: number | string | null;
  grants_count: number | string | null;
  tenders_count: number | string | null;
};

type SecondaryFilterCountRow = {
  subcategory_id: string;
  opportunity_count: number | string | null;
};

const emptyCounts: OpportunityCounts = {
  all: 0,
  giveaways: 0,
  freetoplay: 0,
  launches: 0,
  competitions: 0,
  feeds: 0,
  community: 0,
  grants: 0,
  tenders: 0,
};

export async function loadOpportunities(options: LoadOptions = {}): Promise<LoadResult> {
  const limit = options.limit ?? 1000;
  const offset = options.offset ?? 0;

  if (!isSupabaseConfigured) {
    return {
      data: demoOpportunities,
      feedVersion: null,
      notice: 'Supabase is not configured. Showing demo data for now.',
    };
  }

  const { data, error } = await supabase.rpc('get_eligible_opportunities', {
    country_code: options.countryCode ?? null,
    profile_type: options.profileType ?? null,
    feed_filter: options.filter ?? 'all',
    feed_subcategory: options.subcategory ?? null,
    page_limit: limit,
    page_offset: offset,
  });

  if (error) {
    console.warn('Supabase opportunities query failed:', error.message);
    return {
      data: demoOpportunities,
      feedVersion: null,
      notice: 'Run supabase/schema.sql in the SQL Editor. Demo data is shown until then.',
    };
  }

  const opportunities = ((data ?? []) as Opportunity[]).map((item: Opportunity) => ({
    ...item,
    summary: item.clean_summary ?? '',
  }));

  const firstOpportunity = opportunities[0];
  const feedVersion = firstOpportunity
    ? [firstOpportunity.id, firstOpportunity.published_at, firstOpportunity.updated_at]
        .filter(Boolean)
        .join(':')
    : null;

  return { data: opportunities as Opportunity[], feedVersion, notice: null };
}

export async function loadOpportunityFeedVersion(): Promise<{
  data: string | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from('opportunities')
    .select('id,published_at,updated_at')
    .eq('status', 'active')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  const feedVersion = data
    ? [data.id, data.published_at, data.updated_at].filter(Boolean).join(':')
    : null;

  return { data: feedVersion, error: null };
}

export async function loadOpportunityDetail(opportunityId: string): Promise<{
  data: Partial<Opportunity> | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      data: demoOpportunities.find((item) => item.id === opportunityId) ?? null,
      error: null,
    };
  }

  const { data, error } = await supabase
    .from('opportunities')
    .select(
      'id, summary, clean_summary, prize_description, eligibility, participation_steps, quality_score, risk_flags, quality_notes, eligible_countries, excluded_countries, eligible_regions, localities, audience_tags, eligibility_flags, minimum_age, updated_at',
    )
    .eq('id', opportunityId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Partial<Opportunity>, error: null };
}

async function countActiveOpportunities(applyFilter?: (query: any) => any) {
  let query = supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  if (applyFilter) query = applyFilter(query);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function loadOpportunityCounts(options: {
  countryCode?: string | null;
  profileType?: string | null;
} = {}): Promise<{
  data: OpportunityCounts;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      data: {
        ...emptyCounts,
        all: demoOpportunities.length,
        giveaways: demoOpportunities.filter((item) => item.category === 'giveaways').length,
      },
      error: null,
    };
  }

  try {
    const { data, error } = await supabase
      .rpc('get_eligible_opportunity_counts', {
        country_code: options.countryCode ?? null,
        profile_type: options.profileType ?? null,
      })
      .single();

    if (error) throw error;
    const counts = data as EligibleOpportunityCountsRow | null;

    return {
      data: {
        all: Number(counts?.all_count ?? 0),
        giveaways: Number(counts?.giveaways_count ?? 0),
        freetoplay: Number(counts?.freetoplay_count ?? 0),
        launches: Number(counts?.launches_count ?? 0),
        competitions: Number(counts?.competitions_count ?? 0),
        feeds: Number(counts?.feeds_count ?? 0),
        community: Number(counts?.community_count ?? 0),
        grants: Number(counts?.grants_count ?? 0),
        tenders: Number(counts?.tenders_count ?? 0),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: emptyCounts,
      error: error instanceof Error ? error.message : 'Could not load opportunity counts.',
    };
  }
}

export async function loadGiveawaySubcategoryCounts(options: {
  countryCode?: string | null;
  profileType?: string | null;
} = {}): Promise<{
  data: Record<string, number>;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      data: {
        all: demoOpportunities.filter((item) => item.category === 'giveaways').length,
      },
      error: null,
    };
  }

  try {
    const { data, error } = await supabase.rpc('get_eligible_giveaway_subcategory_counts', {
      country_code: options.countryCode ?? null,
      profile_type: options.profileType ?? null,
    });

    if (error) throw error;

    return {
      data: Object.fromEntries(
        ((data ?? []) as SecondaryFilterCountRow[]).map((item) => [
          item.subcategory_id,
          Number(item.opportunity_count ?? 0),
        ]),
      ),
      error: null,
    };
  } catch (error) {
    return {
      data: {},
      error: error instanceof Error ? error.message : 'Could not load giveaway subcategory counts.',
    };
  }
}

export async function loadFreeToPlaySubcategoryCounts(options: {
  countryCode?: string | null;
  profileType?: string | null;
} = {}): Promise<{
  data: Record<string, number>;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      data: {
        all: demoOpportunities.filter((item) => item.source === 'freetogame').length,
      },
      error: null,
    };
  }

  try {
    const { data, error } = await supabase.rpc('get_eligible_freetoplay_subcategory_counts', {
      country_code: options.countryCode ?? null,
      profile_type: options.profileType ?? null,
    });

    if (error) throw error;

    return {
      data: Object.fromEntries(
        ((data ?? []) as SecondaryFilterCountRow[]).map((item) => [
          item.subcategory_id,
          Number(item.opportunity_count ?? 0),
        ]),
      ),
      error: null,
    };
  } catch (error) {
    return {
      data: {},
      error: error instanceof Error ? error.message : 'Could not load free to play counts.',
    };
  }
}

export async function loadCompetitionSubcategoryCounts(options: {
  countryCode?: string | null;
  profileType?: string | null;
} = {}): Promise<{
  data: Record<string, number>;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return {
      data: {
        all: demoOpportunities.filter((item) => item.source === 'kaggle').length,
      },
      error: null,
    };
  }

  try {
    const { data, error } = await supabase.rpc('get_eligible_competition_subcategory_counts', {
      country_code: options.countryCode ?? null,
      profile_type: options.profileType ?? null,
    });

    if (error) throw error;

    return {
      data: Object.fromEntries(
        ((data ?? []) as SecondaryFilterCountRow[]).map((item) => [
          item.subcategory_id,
          Number(item.opportunity_count ?? 0),
        ]),
      ),
      error: null,
    };
  } catch (error) {
    return {
      data: {},
      error: error instanceof Error ? error.message : 'Could not load competition counts.',
    };
  }
}

async function loadSecondaryCountsRpc(
  rpcName: string,
  options: { countryCode?: string | null; profileType?: string | null } = {},
  fallback: Record<string, number> = {},
): Promise<{ data: Record<string, number>; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { data: fallback, error: null };
  }

  try {
    const { data, error } = await supabase.rpc(rpcName, {
      country_code: options.countryCode ?? null,
      profile_type: options.profileType ?? null,
    });

    if (error) throw error;

    return {
      data: Object.fromEntries(
        ((data ?? []) as SecondaryFilterCountRow[]).map((item) => [
          item.subcategory_id,
          Number(item.opportunity_count ?? 0),
        ]),
      ),
      error: null,
    };
  } catch (error) {
    return {
      data: {},
      error: error instanceof Error ? error.message : `Could not load ${rpcName}.`,
    };
  }
}

export function loadGrantSubcategoryCounts(options: {
  countryCode?: string | null;
  profileType?: string | null;
} = {}) {
  return loadSecondaryCountsRpc('get_eligible_grant_subcategory_counts', options, {
    all: demoOpportunities.filter((item) => item.source === 'grants' || item.source === 'eufunding').length,
  });
}

export function loadTenderSubcategoryCounts(options: {
  countryCode?: string | null;
  profileType?: string | null;
} = {}) {
  return loadSecondaryCountsRpc('get_eligible_tender_subcategory_counts', options, {
    all: demoOpportunities.filter((item) => item.source === 'ted').length,
  });
}

export function loadLaunchSubcategoryCounts(options: {
  countryCode?: string | null;
  profileType?: string | null;
} = {}) {
  return loadSecondaryCountsRpc('get_eligible_launch_subcategory_counts', options, {
    all: demoOpportunities.filter((item) => item.source === 'producthunt').length,
  });
}

export function subscribeToOpportunities(onChange: () => void) {
  if (!isSupabaseConfigured) return () => undefined;

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const channel = supabase
    .channel('opportunities-feed')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'opportunities' },
      () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(onChange, 600);
      },
    )
    .subscribe();

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    void supabase.removeChannel(channel);
  };
}

export async function loadSavedOpportunityIds(): Promise<{
  data: Set<string>;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: new Set(), error: null };
  }

  const { data, error } = await supabase
    .from('saved_opportunities')
    .select('opportunity_id')
    .order('created_at', { ascending: false });

  if (error) {
    return { data: new Set(), error: error.message };
  }

  return {
    data: new Set((data ?? []).map((item) => item.opportunity_id as string)),
    error: null,
  };
}

export async function saveOpportunity(opportunityId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const { error } = await supabase
    .from('saved_opportunities')
    .upsert({ opportunity_id: opportunityId }, { onConflict: 'user_id,opportunity_id' });

  return error ? { ok: false, message: error.message } : { ok: true, message: 'Saved.' };
}

export async function unsaveOpportunity(opportunityId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const { error } = await supabase
    .from('saved_opportunities')
    .delete()
    .eq('opportunity_id', opportunityId);

  return error
    ? { ok: false, message: error.message }
    : { ok: true, message: 'Removed from saved.' };
}

export async function loadHiddenOpportunityIds(): Promise<{
  data: Set<string>;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { data: new Set(), error: null };
  }

  const { data, error } = await supabase
    .from('hidden_opportunities')
    .select('opportunity_id')
    .order('created_at', { ascending: false });

  if (error) {
    return { data: new Set(), error: error.message };
  }

  return {
    data: new Set((data ?? []).map((item) => item.opportunity_id as string)),
    error: null,
  };
}

export async function hideOpportunity(opportunityId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const { error } = await supabase
    .from('hidden_opportunities')
    .upsert({ opportunity_id: opportunityId }, { onConflict: 'user_id,opportunity_id' });

  return error ? { ok: false, message: error.message } : { ok: true, message: 'Hidden.' };
}

export async function unhideOpportunity(opportunityId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  const { error } = await supabase
    .from('hidden_opportunities')
    .delete()
    .eq('opportunity_id', opportunityId);

  return error
    ? { ok: false, message: error.message }
    : { ok: true, message: 'Removed from hidden.' };
}

export async function syncExternalOpportunities(): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Add the Supabase variables to .env first.' };
  }

  const { data, error } = await supabase.functions.invoke('sync-opportunities', {
    body: {
      providers: [
        'gamerpower',
        'epicgames',
        'freetogame',
        'cheapshark',
        'grants',
      ],
    },
  });

  if (error) {
    return {
      ok: false,
      message:
        'The Edge Function was not found. Deploy supabase/functions/sync-opportunities and add the API secrets.',
    };
  }

  const imported = Number(data?.imported ?? 0);
  const deduplicated = Number(data?.deduplicated ?? 0);
  const duplicateMessage =
    deduplicated > 0 ? ` Removed ${deduplicated} duplicate results.` : '';
  return {
    ok: true,
    message: `Synced ${imported} opportunities.${duplicateMessage}`,
  };
}
