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

const supabaseUrl = setting('EXPO_PUBLIC_SUPABASE_URL');
const serviceRoleKey = setting('SUPABASE_SERVICE_ROLE_KEY');
const countryCode = setting('QUALITY_AUDIT_COUNTRY') ?? 'GR';
const profileType = setting('QUALITY_AUDIT_PROFILE_TYPE') ?? 'individual';
const threshold = Number(setting('QUALITY_AUDIT_THRESHOLD') ?? 0.45);

if (!supabaseUrl || !serviceRoleKey) {
  console.log(
    JSON.stringify({
      providers: ['visible-quality-audit'],
      audited: 0,
      skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }),
  );
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const feeds = [
  'giveaways',
  'freetoplay',
  'competitions',
  'grants',
  'tenders',
  'launches',
  'community',
];
const findings = [];
const feedCounts = {};

for (const feed of feeds) {
  const { data, error } = await supabase.rpc('get_eligible_opportunities', {
    country_code: countryCode,
    profile_type: profileType,
    feed_filter: feed,
    feed_subcategory: null,
    page_limit: 80,
    page_offset: 0,
  });

  if (error) throw error;
  feedCounts[feed] = data?.length ?? 0;

  for (const opportunity of data ?? []) {
    const scoreResult = await supabase.rpc('get_opportunity_rank_score', {
      opportunity,
    });
    if (scoreResult.error) throw scoreResult.error;

    const rankScore = Number(scoreResult.data);
    if (!Number.isFinite(rankScore) || rankScore >= threshold) continue;

    findings.push({
      feed,
      id: opportunity.id,
      title: opportunity.title,
      source: opportunity.source,
      rank_score: Number(rankScore.toFixed(3)),
      quality_score: opportunity.quality_score,
      risk_flags: opportunity.risk_flags ?? [],
      quality_notes: opportunity.quality_notes ?? [],
    });
  }
}

findings.sort((left, right) => left.rank_score - right.rank_score || left.title.localeCompare(right.title));

console.log(
  JSON.stringify(
    {
      providers: ['visible-quality-audit'],
      countryCode,
      profileType,
      threshold,
      feedCounts,
      flaggedTotal: findings.length,
      findings: findings.slice(0, 80),
    },
    null,
    2,
  ),
);
