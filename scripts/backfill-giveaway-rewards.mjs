import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { classifyRewardType, rewardSubcategories } from './lib/reward-classifier.mjs';

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

if (!supabaseUrl || !serviceRoleKey) {
  console.log(
    JSON.stringify({
      providers: ['reward-categorization'],
      imported: 0,
      skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }),
  );
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const giveawaySources = ['gamerpower', 'epicgames', 'cheapshark', 'kingsumo'];
const rewardSubcategorySet = new Set(rewardSubcategories);

function normalizeGeneratedRewardTag(opportunity, subcategory) {
  if (!['web', 'social'].includes(opportunity.source_type)) return opportunity.tags;
  if (!Array.isArray(opportunity.tags) || opportunity.tags.length === 0) return opportunity.tags;

  const nextTags = [...opportunity.tags];
  const lastTag = String(nextTags.at(-1) ?? '').toLowerCase();
  if (rewardSubcategorySet.has(lastTag) && lastTag !== subcategory) {
    nextTags[nextTags.length - 1] = subcategory;
  }

  return nextTags;
}

function tagsChanged(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return true;
  return left.some((item, index) => item !== right[index]);
}

const { data, error } = await supabase
  .from('opportunities')
  .select('id, source, source_type, category, subcategory, title, organization, summary, tags, raw_data')
  .eq('status', 'active')
  .or(`source.in.(${giveawaySources.join(',')}),source_type.eq.social,category.eq.giveaways`);

if (error) throw error;

const updates = [];
const counts = {};

for (const opportunity of data ?? []) {
  const subcategory = classifyRewardType(opportunity);
  const tags = normalizeGeneratedRewardTag(opportunity, subcategory);
  counts[subcategory] = (counts[subcategory] ?? 0) + 1;

  if (
    opportunity.category !== 'giveaways' ||
    opportunity.subcategory !== subcategory ||
    tagsChanged(opportunity.tags, tags)
  ) {
    const values = { category: 'giveaways', subcategory };
    if (Array.isArray(tags)) values.tags = tags;
    updates.push({
      id: opportunity.id,
      values,
    });
  }
}

let updated = 0;

for (const update of updates) {
  const { error: updateError } = await supabase
    .from('opportunities')
    .update(update.values)
    .eq('id', update.id);

  if (updateError) throw updateError;
  updated += 1;
}

console.log(
  JSON.stringify({
    providers: ['reward-categorization'],
    imported: updated,
    categorized: data?.length ?? 0,
    counts,
  }),
);
