import { demoOpportunities } from '../data/demoOpportunities';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { Opportunity } from '../types';

type LoadResult = {
  data: Opportunity[];
  notice: string | null;
};

export async function loadOpportunities(): Promise<LoadResult> {
  if (!isSupabaseConfigured) {
    return {
      data: demoOpportunities,
      notice: 'Λείπουν οι μεταβλητές Supabase. Προβάλλονται δοκιμαστικά δεδομένα.',
    };
  }

  const { data, error } = await supabase
    .from('opportunities')
    .select(
      'id, external_id, source, title, organization, summary, url, image_url, amount, currency, deadline, tags, status, published_at, created_at, updated_at',
    )
    .eq('status', 'active')
    .order('published_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.warn('Supabase opportunities query failed:', error.message);
    return {
      data: demoOpportunities,
      notice: 'Τρέξε το supabase/schema.sql στο SQL Editor. Ως τότε εμφανίζονται demo δεδομένα.',
    };
  }

  return { data: (data ?? []) as Opportunity[], notice: null };
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

export async function syncExternalOpportunities(): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Συμπλήρωσε πρώτα τις μεταβλητές Supabase στο .env.' };
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
        'Δεν βρέθηκε η Edge Function. Κάνε deploy το supabase/functions/sync-opportunities και πρόσθεσε τα API secrets.',
    };
  }

  const imported = Number(data?.imported ?? 0);
  const deduplicated = Number(data?.deduplicated ?? 0);
  const duplicateMessage =
    deduplicated > 0 ? ` Αφαιρέθηκαν ${deduplicated} διπλότυπες εμφανίσεις.` : '';
  return {
    ok: true,
    message: `Συγχρονίστηκαν ${imported} ευκαιρίες.${duplicateMessage}`,
  };
}
