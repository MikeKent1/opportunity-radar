import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  classifyRewardType,
  hasStrongCashReward,
  rewardSubcategories,
} from './lib/reward-classifier.mjs';

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
      providers: ['giveaway-categorization-fix'],
      mode: apply ? 'apply' : 'dry-run',
      updated: 0,
      skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }),
  );
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const giveawaySources = ['gamerpower', 'epicgames', 'cheapshark', 'kingsumo'];
const generatedRewardTags = new Set([
  ...rewardSubcategories,
  'games',
  'gift card',
  'gift cards',
  'in-game',
  'trips',
]);

function nextTags(tags, expectedSubcategory) {
  const sourceTags = Array.isArray(tags) ? tags : [];
  const cleaned = sourceTags.filter((tag) => !generatedRewardTags.has(String(tag).toLowerCase()));
  return [...cleaned, expectedSubcategory];
}

function getCorrection(opportunity) {
  const current = opportunity.subcategory ?? 'other';
  const expected = classifyRewardType(opportunity);

  if (
    current === 'cash' &&
    !hasStrongCashReward(opportunity) &&
    ['trip', 'hardware', 'gift_card'].includes(expected)
  ) {
    return {
      expected: expected === 'cash' ? 'other' : expected,
      reason: 'Stored as cash but lacks a strong direct-cash reward signal.',
    };
  }

  return null;
}

const { data, error } = await supabase
  .from('opportunities')
  .select(
    'id, source, source_type, category, subcategory, classification_method, classification_confidence, title, organization, summary, clean_summary, prize_description, eligibility, tags, raw_data',
  )
  .eq('status', 'active')
  .or(`source.in.(${giveawaySources.join(',')}),source_type.eq.social,category.eq.giveaways`);

if (error) throw error;

const corrections = [];

for (const opportunity of data ?? []) {
  const correction = getCorrection(opportunity);
  if (!correction) continue;

  corrections.push({
    id: opportunity.id,
    title: opportunity.title,
    source: opportunity.source,
    current: opportunity.subcategory ?? 'other',
    expected: correction.expected,
    reason: correction.reason,
    tags: nextTags(opportunity.tags, correction.expected),
  });
}

const applied = [];
const failed = [];

if (apply) {
  for (const correction of corrections) {
    const { error: updateError } = await supabase
      .from('opportunities')
      .update({
        subcategory: correction.expected,
        tags: correction.tags,
        classification_method: 'rules_audit',
        classification_confidence: 0.86,
        classification_reason: correction.reason,
      })
      .eq('id', correction.id);

    if (updateError) {
      failed.push({ id: correction.id, title: correction.title, error: updateError.message });
    } else {
      applied.push(correction);
    }
  }
}

console.log(
  JSON.stringify(
    {
      providers: ['giveaway-categorization-fix'],
      mode: apply ? 'apply' : 'dry-run',
      audited: data?.length ?? 0,
      candidates: corrections.length,
      updated: applied.length,
      failed,
      corrections: (apply ? applied : corrections).map((item) => ({
        id: item.id,
        title: item.title,
        source: item.source,
        from: item.current,
        to: item.expected,
        reason: item.reason,
      })),
    },
    null,
    2,
  ),
);
