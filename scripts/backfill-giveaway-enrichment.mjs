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

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?(?:<\/script>|$)/gi, ' ')
    .replace(/<style[\s\S]*?(?:<\/style>|$)/gi, ' ')
    .replace(/<img\b[\s\S]*?(?:>|$)/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSweepWidgetDetail(html) {
  const titleStart = html.search(/<h1\b/i);
  const moreStart = html.search(/<h2\b[^>]*>\s*More Free Giveaways to Enter\s*<\/h2>/i);
  const body = titleStart >= 0
    ? html.slice(titleStart, moreStart > titleStart ? moreStart : titleStart + 6000)
    : html.slice(0, moreStart > 0 ? moreStart : 6000);
  return stripHtml(body);
}

async function hydrateDetails(opportunity) {
  if (!/^https:\/\/sweepwidget\.com\/giveaways\/[^/?#]+/i.test(opportunity.url ?? '')) {
    return opportunity;
  }

  try {
    const response = await fetch(opportunity.url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'OpportunityRadar/1.0 (+https://github.com/MikeKent1/opportunity-radar)',
      },
    });
    if (!response.ok) return opportunity;

    const detailPageText = extractSweepWidgetDetail(await response.text());
    if (!detailPageText) return opportunity;

    return {
      ...opportunity,
      summary: detailPageText,
      raw_data: {
        ...(opportunity.raw_data ?? {}),
        details: detailPageText,
        detailPageText,
      },
    };
  } catch {
    return opportunity;
  }
}

let query = supabase
  .from('opportunities')
  .select(
    'id, source, source_type, category, subcategory, title, organization, summary, url, deadline, participation_steps, tags, raw_data, clean_summary, enrichment_method',
  )
  .eq('status', 'active')
  .eq('category', 'giveaways')
  .in('source_type', ['web', 'social'])
  .order('published_at', { ascending: false })
  .limit(limit);

if (!reprocess) {
  query = query.or('clean_summary.is.null,enrichment_method.eq.none,enrichment_method.eq.rules_ai_failed');
}

const { data, error } = await query;

if (error) throw error;

let updated = 0;
const methods = {};

for (const opportunity of data ?? []) {
  const hydratedOpportunity = await hydrateDetails(opportunity);
  const enrichment = await enrichGiveawayWithAi(hydratedOpportunity, { env });
  methods[enrichment.enrichment_method] = (methods[enrichment.enrichment_method] ?? 0) + 1;

  const { error: updateError } = await supabase
    .from('opportunities')
    .update({
      clean_summary: enrichment.clean_summary,
      prize_description: enrichment.prize_description,
      eligibility: enrichment.eligibility,
      eligible_countries: enrichment.eligible_countries,
      localities: enrichment.localities,
      quality_score: enrichment.quality_score,
      risk_flags: enrichment.risk_flags,
      quality_notes: enrichment.quality_notes,
      enrichment_method: enrichment.enrichment_method,
      enrichment_reason: enrichment.enrichment_reason,
      summary: String(hydratedOpportunity.summary ?? '').slice(0, 700),
      raw_data: hydratedOpportunity.raw_data,
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
