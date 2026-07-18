import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { enrichGiveawayWithAi } from './lib/ai-giveaway-enrichment.mjs';

const env = fs.existsSync('.env')
  ? Object.fromEntries(
      fs
        .readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    )
  : {};

const setting = (key) => {
  const value = process.env[key] ?? env[key];
  return value && value.trim() ? value.trim() : undefined;
};

const supabaseUrl = setting('EXPO_PUBLIC_SUPABASE_URL');
const serviceRoleKey = setting('SUPABASE_SERVICE_ROLE_KEY');
const limit = Math.max(1, Number(setting('AI_ENRICHMENT_BACKFILL_LIMIT') ?? 80));
const reprocess = ['1', 'true', 'yes'].includes(String(setting('AI_ENRICHMENT_REPROCESS') ?? '').toLowerCase());

if (!supabaseUrl || !serviceRoleKey) {
  console.log(
    JSON.stringify({
      providers: ['giveaway-enrichment'],
      imported: 0,
      skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }),
  );
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

let query = supabase
  .from('opportunities')
  .select(
    'id, source, source_type, category, subcategory, title, organization, summary, deadline, participation_steps, tags, raw_data, clean_summary, enrichment_method',
  )
  .eq('status', 'active')
  .eq('category', 'giveaways')
  .in('source_type', ['web', 'social'])
  .order('published_at', { ascending: false })
  .limit(limit);

if (reprocess) {
  query = query.eq('enrichment_method', 'ai');
} else {
  query = query.or('clean_summary.is.null,enrichment_method.eq.none,enrichment_method.eq.rules_ai_failed');
}

const { data, error } = await query;

if (error) throw error;

let updated = 0;
const methods = {};

for (const opportunity of data ?? []) {
  const enrichment = await enrichGiveawayWithAi(opportunity, { env });
  methods[enrichment.enrichment_method] = (methods[enrichment.enrichment_method] ?? 0) + 1;

  const { error: updateError } = await supabase
    .from('opportunities')
    .update({
      clean_summary: enrichment.clean_summary,
      prize_description: enrichment.prize_description,
      eligibility: enrichment.eligibility,
      quality_score: enrichment.quality_score,
      risk_flags: enrichment.risk_flags,
      quality_notes: enrichment.quality_notes,
      enrichment_method: enrichment.enrichment_method,
      enrichment_reason: enrichment.enrichment_reason,
    })
    .eq('id', opportunity.id);

  if (updateError) throw updateError;
  updated += 1;
}

console.log(
  JSON.stringify({
    providers: ['giveaway-enrichment'],
    imported: updated,
    candidates: data?.length ?? 0,
    reprocess,
    methods,
  }),
);
