import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const execFileAsync = promisify(execFile);

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
const kaggleApiToken = setting('KAGGLE_API_TOKEN');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

if (!kaggleApiToken) {
  throw new Error('Missing KAGGLE_API_TOKEN');
}

const command = process.platform === 'win32' ? 'kaggle.exe' : 'kaggle';
const { stdout } = await execFileAsync(
  command,
  [
    'competitions',
    'list',
    '--group',
    'general',
    '--category',
    'all',
    '--sort-by',
    'recentlyCreated',
    '--page-size',
    '100',
    '--format',
    'json',
  ],
  {
    env: { ...process.env, KAGGLE_API_TOKEN: kaggleApiToken },
    maxBuffer: 1024 * 1024 * 5,
  },
);

const payload = JSON.parse(stdout);
const rows = Array.isArray(payload)
  ? payload
  : Array.isArray(payload?.competitions)
    ? payload.competitions
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

const text = (value) => String(value ?? '').trim();
const firstPresent = (item, keys) => {
  for (const key of keys) {
    if (text(item[key])) return text(item[key]);
  }
  return '';
};

const competitionSlug = (ref) => {
  const value = text(ref);
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.pathname.split('/').filter(Boolean).pop() ?? value;
  } catch {
    return value.split('/').filter(Boolean).pop() ?? value;
  }
};

const titleFromSlug = (slug) =>
  text(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('en-US'));

const amountFromReward = (reward) => {
  const normalized = text(reward).replace(/,/g, '');
  const match = normalized.match(/(?:\$)?([0-9]+(?:\.[0-9]+)?)\s*(?:usd|us\$|dollars?)?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const opportunities = rows.flatMap((item, index) => {
  const ref = firstPresent(item, ['ref', 'slug', 'id']) || `kaggle-${index}`;
  const slug = competitionSlug(ref);
  const title = firstPresent(item, ['title', 'name']) || titleFromSlug(slug) || 'Kaggle competition';
  const deadlineRaw = firstPresent(item, ['deadline', 'deadlineDate', 'deadlineTime']);
  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  const reward = firstPresent(item, ['reward', 'prize', 'totalPrize']);
  const category = firstPresent(item, ['category', 'competitionType', 'type']);
  const teamCount = firstPresent(item, ['teamCount', 'teamsCount', 'numberOfTeams']);
  const url =
    firstPresent(item, ['url', 'competitionUrl']) ||
    (ref.startsWith('http')
      ? ref
      : `https://www.kaggle.com/competitions/${encodeURIComponent(slug || ref)}`);

  return [
    {
      external_id: ref,
      source: 'kaggle',
      title,
      organization: 'Kaggle',
      summary: [
        reward ? `Prize: ${reward}` : '',
        teamCount ? `${teamCount} teams` : '',
        category ? `Category: ${category}` : '',
      ]
        .filter(Boolean)
        .join(' · ') || 'Open Kaggle competition',
      url,
      image_url: null,
      amount: amountFromReward(reward),
      currency: 'USD',
      deadline: deadline && Number.isFinite(deadline.getTime())
        ? deadline.toISOString()
        : null,
      tags: ['Competition', category, reward].filter(Boolean).slice(0, 5),
      eligible_countries: ['WORLDWIDE'],
      eligible_regions: ['WORLDWIDE'],
      audience_tags: ['individual'],
      eligibility_flags: [],
      status: 'active',
      published_at: new Date().toISOString(),
      raw_data: item,
    },
  ];
});

const supabase = createClient(supabaseUrl, serviceRoleKey);
const { error: closeError } = await supabase
  .from('opportunities')
  .update({ status: 'closed' })
  .eq('source', 'kaggle')
  .eq('status', 'active');
if (closeError) throw closeError;

if (opportunities.length > 0) {
  const { error: upsertError } = await supabase
    .from('opportunities')
    .upsert(opportunities, { onConflict: 'source,external_id' });
  if (upsertError) throw upsertError;
}

console.log(JSON.stringify({ imported: opportunities.length, providers: ['kaggle'] }));
