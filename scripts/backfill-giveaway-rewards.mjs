import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { classifyRewardType } from './lib/reward-classifier.mjs';

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

const { data, error } = await supabase
  .from('opportunities')
  .select('id, source, source_type, category, subcategory, title, organization, summary, tags, raw_data')
  .eq('status', 'active')
  .or(`source.in.(${giveawaySources.join(',')}),source_type.eq.social,category.eq.giveaways`);

if (error) throw error;

const updates = new Map();
const counts = {};

for (const opportunity of data ?? []) {
  const subcategory = classifyRewardType(opportunity);
  counts[subcategory] = (counts[subcategory] ?? 0) + 1;

  if (opportunity.category !== 'giveaways' || opportunity.subcategory !== subcategory) {
    const bucket = updates.get(subcategory) ?? [];
    bucket.push(opportunity.id);
    updates.set(subcategory, bucket);
  }
}

let updated = 0;

for (const [subcategory, ids] of updates.entries()) {
  const { error: updateError } = await supabase
    .from('opportunities')
    .update({ category: 'giveaways', subcategory })
    .in('id', ids);

  if (updateError) throw updateError;
  updated += ids.length;
}

console.log(
  JSON.stringify({
    providers: ['reward-categorization'],
    imported: updated,
    categorized: data?.length ?? 0,
    counts,
  }),
);
