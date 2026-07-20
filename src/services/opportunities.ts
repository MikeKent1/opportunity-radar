import { demoOpportunities } from '../data/demoOpportunities';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { Opportunity } from '../types';

type LoadResult = {
  data: Opportunity[];
  feedVersion: string | null;
  notice: string | null;
};

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

export async function loadOpportunities(): Promise<LoadResult> {
  if (!isSupabaseConfigured) {
    return {
      data: demoOpportunities,
      feedVersion: null,
      notice: 'Supabase is not configured. Showing demo data for now.',
    };
  }

  const { data, error } = await supabase
    .from('opportunities')
    .select(
      'id, external_id, source, source_type, category, subcategory, title, organization, clean_summary, quality_score, risk_flags, quality_notes, eligible_countries, excluded_countries, eligible_regions, localities, audience_tags, eligibility_flags, minimum_age, url, participation_url, image_url, amount, currency, deadline, expires_at, tags, status, published_at, created_at, updated_at',
    )
    .eq('status', 'active')
    .order('published_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.warn('Supabase opportunities query failed:', error.message);
    return {
      data: demoOpportunities,
      feedVersion: null,
      notice: 'Run supabase/schema.sql in the SQL Editor. Demo data is shown until then.',
    };
  }

  const opportunities = (data ?? []).map((item) => ({
    ...item,
    summary: item.clean_summary ?? '',
  }));

  const feedVersion = opportunities.reduce<string | null>((latest, item) => {
    if (!item.updated_at) return latest;
    return !latest || item.updated_at > latest ? item.updated_at : latest;
  }, null);

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
    .select('updated_at')
    .eq('status', 'active')
    .order('published_at', { ascending: false })
    .limit(1000);

  if (error) {
    return { data: null, error: error.message };
  }

  const feedVersion = (data ?? []).reduce<string | null>((latest, item) => {
    const updatedAt = String(item.updated_at ?? '');
    if (!updatedAt) return latest;
    return !latest || updatedAt > latest ? updatedAt : latest;
  }, null);

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

export async function loadOpportunityCounts(): Promise<{
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
    const [
      all,
      giveaways,
      freetoplay,
      launches,
      competitions,
      feeds,
      community,
      grants,
      tenders,
    ] = await Promise.all([
      countActiveOpportunities(),
      countActiveOpportunities((query) =>
        query.or(
          'source_type.eq.social,category.eq.giveaways,source.in.(gamerpower,epicgames,cheapshark,kingsumo)',
        ),
      ),
      countActiveOpportunities((query) => query.eq('source', 'freetogame')),
      countActiveOpportunities((query) => query.eq('source', 'producthunt')),
      countActiveOpportunities((query) => query.eq('source', 'kaggle')),
      countActiveOpportunities((query) => query.eq('source', 'rss')),
      countActiveOpportunities((query) => query.eq('source', 'reddit')),
      countActiveOpportunities((query) => query.in('source', ['grants', 'eufunding'])),
      countActiveOpportunities((query) => query.eq('source', 'ted')),
    ]);

    return {
      data: {
        all,
        giveaways,
        freetoplay,
        launches,
        competitions,
        feeds,
        community,
        grants,
        tenders,
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
