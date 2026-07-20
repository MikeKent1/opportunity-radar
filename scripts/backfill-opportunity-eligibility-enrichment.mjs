import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { enrichOpportunityEligibilityWithAi } from './lib/ai-opportunity-eligibility.mjs';

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
const limit = Math.max(
  1,
  Number(setting('AI_OPPORTUNITY_ELIGIBILITY_BACKFILL_LIMIT') ?? setting('AI_ENRICHMENT_BACKFILL_LIMIT') ?? 80),
);
const reprocess = ['1', 'true', 'yes'].includes(
  String(setting('AI_OPPORTUNITY_ELIGIBILITY_REPROCESS') ?? setting('AI_ENRICHMENT_REPROCESS') ?? '').toLowerCase(),
);
const requestedSources = (setting('AI_OPPORTUNITY_ELIGIBILITY_SOURCES') ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!supabaseUrl || !serviceRoleKey) {
  console.log(
    JSON.stringify({
      providers: ['opportunity-eligibility-enrichment'],
      imported: 0,
      skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }),
  );
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const enrichmentSources = [
  'freetogame',
  'producthunt',
  'kaggle',
  'rss',
  'reddit',
  'grants',
  'eufunding',
  'ted',
];
const sourceFilter = requestedSources.length
  ? enrichmentSources.filter((source) => requestedSources.includes(source))
  : enrichmentSources;

let query = supabase
  .from('opportunities')
  .select(
    'id, source, source_type, category, title, organization, summary, clean_summary, eligibility, eligible_countries, excluded_countries, eligible_regions, localities, audience_tags, eligibility_flags, minimum_age, amount, currency, deadline, tags, raw_data, quality_score, quality_notes, enrichment_method',
  )
  .eq('status', 'active')
  .in('source', sourceFilter)
  .order('published_at', { ascending: false })
  .limit(limit);

if (!reprocess) {
  query = query.or('clean_summary.is.null,enrichment_method.is.null,enrichment_method.eq.none,enrichment_method.eq.rules,enrichment_method.eq.rules_ai_failed');
}

const { data, error } = await query;

if (error) throw error;

let updated = 0;
const methods = {};
const sources = {};

for (const opportunity of data ?? []) {
  const enrichment = await enrichOpportunityEligibilityWithAi(opportunity, { env });
  methods[enrichment.enrichment_method] = (methods[enrichment.enrichment_method] ?? 0) + 1;
  sources[opportunity.source] = (sources[opportunity.source] ?? 0) + 1;

  const { error: updateError } = await supabase
    .from('opportunities')
    .update({
      clean_summary: enrichment.clean_summary,
      eligibility: enrichment.eligibility,
      eligible_countries: enrichment.eligible_countries,
      excluded_countries: enrichment.excluded_countries,
      eligible_regions: enrichment.eligible_regions,
      audience_tags: enrichment.audience_tags,
      eligibility_flags: enrichment.eligibility_flags,
      minimum_age: enrichment.minimum_age,
      quality_score: enrichment.quality_score,
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
    providers: ['opportunity-eligibility-enrichment'],
    imported: updated,
    candidates: data?.length ?? 0,
    reprocess,
    methods,
    sources,
  }),
);
