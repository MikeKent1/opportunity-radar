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
          return [line.slice(0, index).replace(/^\uFEFF/, ''), line.slice(index + 1)];
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
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const now = new Date().toISOString();

async function countRows(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function sourceHealth(source) {
  const count = await countRows(
    supabase
      .from('opportunities')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('source', source),
  );
  const { data, error } = await supabase
    .from('opportunities')
    .select('published_at, updated_at, deadline')
    .eq('status', 'active')
    .eq('source', source)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;

  return { source, active: count, latest: data?.[0] ?? null };
}

const sources = [
  'gamerpower',
  'epicgames',
  'freetogame',
  'cheapshark',
  'grants',
  'eufunding',
  'ted',
  'producthunt',
  'kaggle',
  'rss',
  'sweepstakes_web',
  'reddit',
];

const sourceRows = [];
for (const source of sources) {
  sourceRows.push(await sourceHealth(source));
}

const expiredActive = await countRows(
  supabase
    .from('opportunities')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .not('deadline', 'is', null)
    .lt('deadline', now),
);

const instagramEnabled = await countRows(
  supabase
    .from('social_sources')
    .select('*', { count: 'exact', head: true })
    .eq('platform', 'instagram')
    .eq('enabled', true),
);
const instagramDisabled = await countRows(
  supabase
    .from('social_sources')
    .select('*', { count: 'exact', head: true })
    .eq('platform', 'instagram')
    .eq('enabled', false),
);

const { data: instagramTop, error: instagramTopError } = await supabase
  .from('social_source_performance')
  .select('username, category, enabled, posts_saved, giveaway_posts, imported_opportunities, latest_posted_at')
  .eq('enabled', true)
  .order('imported_opportunities', { ascending: false })
  .order('posts_saved', { ascending: false })
  .limit(12);
if (instagramTopError) throw instagramTopError;

const { data: instagramZero, error: instagramZeroError } = await supabase
  .from('social_source_performance')
  .select('username, category, enabled, posts_saved, imported_opportunities, latest_posted_at')
  .eq('enabled', true)
  .eq('imported_opportunities', 0)
  .order('posts_saved', { ascending: false })
  .limit(12);
if (instagramZeroError) throw instagramZeroError;

const payload = {
  checkedAt: now,
  expiredActive,
  sources: sourceRows,
  instagram: {
    enabled: instagramEnabled,
    disabled: instagramDisabled,
    top: instagramTop ?? [],
    enabledZeroYield: instagramZero ?? [],
  },
};

const formatDate = (value) => (value ? new Date(value).toISOString().slice(0, 16).replace('T', ' ') : '');

const markdown = [
  '## Pipeline health',
  '',
  `Checked at: ${payload.checkedAt}`,
  `Expired active opportunities: ${payload.expiredActive}`,
  '',
  '### Sources',
  '',
  '| Source | Active | Latest update | Latest deadline |',
  '| --- | ---: | --- | --- |',
  ...payload.sources.map(
    (row) =>
      `| ${row.source} | ${row.active} | ${formatDate(row.latest?.updated_at)} | ${formatDate(
        row.latest?.deadline,
      )} |`,
  ),
  '',
  '### Instagram',
  '',
  `Enabled sources: ${payload.instagram.enabled}`,
  `Disabled sources: ${payload.instagram.disabled}`,
  '',
  '| Top source | Imported | Posts saved | Latest post |',
  '| --- | ---: | ---: | --- |',
  ...payload.instagram.top.slice(0, 8).map(
    (row) =>
      `| ${row.username} | ${row.imported_opportunities} | ${row.posts_saved} | ${formatDate(
        row.latest_posted_at,
      )} |`,
  ),
  '',
  '### Enabled zero-yield sources',
  '',
  payload.instagram.enabledZeroYield.length
    ? payload.instagram.enabledZeroYield.map((row) => `- ${row.username}: ${row.posts_saved} posts`).join('\n')
    : 'None',
  '',
].join('\n');

const json = JSON.stringify(payload, null, 2);
console.log(json);

if (process.env.PIPELINE_HEALTH_OUTPUT) {
  fs.writeFileSync(process.env.PIPELINE_HEALTH_OUTPUT, `${json}\n`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}
