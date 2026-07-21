import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

const apply = process.argv.includes('--apply');
const supabaseUrl = setting('EXPO_PUBLIC_SUPABASE_URL');
const serviceRoleKey = setting('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  console.log(
    JSON.stringify({
      providers: ['local-eligibility-audit'],
      mode: apply ? 'apply' : 'dry-run',
      audited: 0,
      candidates: 0,
      skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }),
  );
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const compact = (values, limit = 8) => [...new Set((values ?? []).filter(Boolean))].slice(0, limit);
const lower = (value) => String(value ?? '').toLowerCase();

function buildText(opportunity) {
  const raw = opportunity.raw_data && typeof opportunity.raw_data === 'object' ? opportunity.raw_data : {};
  return [
    opportunity.title,
    opportunity.clean_summary,
    opportunity.prize_description,
    opportunity.eligibility,
    opportunity.summary,
    opportunity.organization,
    ...(opportunity.tags ?? []),
    ...(opportunity.localities ?? []),
    raw.type,
    raw.worth,
    raw.instructions,
    raw.description,
    raw.details,
    raw.title,
  ]
    .join(' ')
    .toLowerCase();
}

function buildPrimaryText(opportunity) {
  return [
    opportunity.title,
    opportunity.prize_description,
    opportunity.eligibility,
    ...(opportunity.localities ?? []),
  ]
    .join(' ')
    .toLowerCase();
}

function hasTravelPrizeSignal(text) {
  return (
    /\b(trip|travel package|vacation|holiday|getaway|cruise|flyaway|flight|hotel stay|night stay|resort stay|luxury stay|luxury escape|family vacation)\b/i.test(
      text,
    ) ||
    /\b(win|wins|winner|winners|get|gets|prize|grand prize|chance to win).{0,100}\b(flights?|hotel|vacation|holiday|getaway|resort|cruise|flyaway|trip)\b/i.test(
      text,
    )
  );
}

function hasLocalUseSignal(text) {
  return (
    /\b(local pickup|pickup only|in-store only|specific location|at participating locations?)\b/i.test(text) ||
    /\b(admission tickets?|general admission|ga tickets?|ticket giveaway|tickets contest|tickets giveaway|family 4-pack|4-pack|four-pack)\b/i.test(
      text,
    ) ||
    /\b(waterpark|water park|zoo|aquatic center|adventure park|comedy castle|theatres?|theaters?|field tickets?|lollapalooza|legoland|holiday world|splashin' safari|urban air)\b/i.test(
      text,
    ) ||
    /\b(unlimited monthly pass|monthly pass|class pass|fitness pass|venue passes?|water park passes?)\b/i.test(
      text,
    )
  );
}

function hasStrongVenueUseSignal(text) {
  return (
    /\b(general admission|ga tickets?|family 4-pack|4-pack|four-pack)\b/i.test(text) &&
    /\b(legoland|waterpark|water park|zoo|aquatic center|adventure park|comedy castle|theatres?|theaters?|field|lollapalooza|holiday world|splashin' safari|urban air)\b/i.test(
      text,
    )
  );
}

function shouldFlagLocalUse(opportunity) {
  const text = buildText(opportunity);
  const primaryText = buildPrimaryText(opportunity);
  const riskFlags = opportunity.risk_flags ?? [];
  if (riskFlags.includes('local_use_reward') || riskFlags.includes('region_limited')) return null;

  const hasLocalities = (opportunity.localities ?? []).length > 0;
  if (!hasLocalities && !hasStrongVenueUseSignal(primaryText)) return null;
  if (!hasLocalUseSignal(text) && !hasStrongVenueUseSignal(primaryText)) return null;

  return {
    reason: hasLocalities
      ? 'Has locality plus ticket/pass/venue/local-use wording.'
      : 'Has venue ticket/admission wording without broad-use travel context.',
    travelContext: hasTravelPrizeSignal(text),
  };
}

const { data, error } = await supabase
  .from('opportunities')
  .select(
    'id, source, source_type, category, subcategory, title, organization, summary, clean_summary, prize_description, eligibility, eligible_countries, eligible_regions, localities, audience_tags, eligibility_flags, risk_flags, quality_score, quality_notes, tags, raw_data',
  )
  .eq('status', 'active')
  .order('published_at', { ascending: false })
  .limit(2000);

if (error) throw error;

const candidates = [];

for (const opportunity of data ?? []) {
  const finding = shouldFlagLocalUse(opportunity);
  if (!finding) continue;

  candidates.push({
    id: opportunity.id,
    title: opportunity.title,
    source: opportunity.source,
    subcategory: opportunity.subcategory ?? 'other',
    localities: opportunity.localities ?? [],
    eligible_countries: opportunity.eligible_countries ?? [],
    risk_flags: opportunity.risk_flags ?? [],
    quality_score: opportunity.quality_score,
    reason: finding.reason,
    travelContext: finding.travelContext,
  });
}

const applied = [];
const failed = [];

if (apply) {
  for (const item of candidates) {
    const riskFlags = compact([...(item.risk_flags ?? []), 'local_use_reward'], 8);
    const qualityNotes = compact(['local_use_reward'], 8);
    const nextQualityScore = Number.isFinite(Number(item.quality_score))
      ? Math.min(Number(item.quality_score), 0.55)
      : 0.55;

    const { error: updateError } = await supabase
      .from('opportunities')
      .update({
        risk_flags: riskFlags,
        quality_score: nextQualityScore,
        quality_notes: qualityNotes,
        enrichment_method: 'rules_local_eligibility',
        enrichment_reason: item.reason,
      })
      .eq('id', item.id);

    if (updateError) {
      failed.push({ id: item.id, title: item.title, error: updateError.message });
    } else {
      applied.push(item);
    }
  }
}

console.log(
  JSON.stringify(
    {
      providers: ['local-eligibility-audit'],
      mode: apply ? 'apply' : 'dry-run',
      audited: data?.length ?? 0,
      candidates: candidates.length,
      updated: applied.length,
      failed,
      findings: (apply ? applied : candidates).map((item) => ({
        id: item.id,
        title: item.title,
        source: item.source,
        subcategory: item.subcategory,
        localities: item.localities,
        eligible_countries: item.eligible_countries,
        reason: item.reason,
      })),
    },
    null,
    2,
  ),
);
