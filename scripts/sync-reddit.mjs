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
const clientId = setting('REDDIT_CLIENT_ID');
const clientSecret = setting('REDDIT_CLIENT_SECRET');
const userAgent =
  setting('REDDIT_USER_AGENT') ??
  'script:opportunity-radar:v1.0 (by u/MikeKent1)';
const subreddits = (setting('REDDIT_SUBREDDITS') ?? '')
  .split(/[\n,]+/)
  .map((subreddit) => subreddit.trim().replace(/^r\//i, ''))
  .filter(Boolean);
const keywords = (setting('REDDIT_KEYWORDS') ?? '')
  .split(',')
  .map((keyword) => keyword.trim().toLocaleLowerCase('en-US'))
  .filter(Boolean);
const minScore = Number(setting('REDDIT_MIN_SCORE') ?? 5);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

if (!clientId || !clientSecret || subreddits.length === 0) {
  console.log(
    JSON.stringify({
      imported: 0,
      providers: ['reddit'],
      skipped: 'Missing REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET or REDDIT_SUBREDDITS',
    }),
  );
  process.exit(0);
}

const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
  method: 'POST',
  headers: {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': userAgent,
  },
  body: new URLSearchParams({ grant_type: 'client_credentials' }),
});

const tokenPayload = await tokenResponse.json();
if (!tokenResponse.ok) throw new Error(JSON.stringify(tokenPayload));
const accessToken = tokenPayload.access_token;

const text = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const matchesKeywords = (post) => {
  if (!keywords.length) return true;
  const haystack = `${post.title} ${post.selftext} ${post.link_flair_text}`.toLocaleLowerCase(
    'en-US',
  );
  return keywords.some((keyword) => haystack.includes(keyword));
};

const opportunities = [];

for (const subreddit of subreddits.slice(0, 20)) {
  const url = `https://oauth.reddit.com/r/${encodeURIComponent(
    subreddit,
  )}/new?limit=25&raw_json=1`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': userAgent,
    },
  });

  if (!response.ok) {
    console.warn(`Reddit subreddit failed r/${subreddit}: ${response.status}`);
    continue;
  }

  const payload = await response.json();
  const posts = payload.data?.children?.map((child) => child?.data).filter(Boolean) ?? [];

  for (const post of posts) {
    if (post.over_18 || post.stickied || post.removed_by_category) continue;
    if (Number(post.score ?? 0) < minScore) continue;
    if (!matchesKeywords(post)) continue;

    const permalink = text(post.permalink);
    const redditUrl = permalink
      ? `https://www.reddit.com${permalink}`
      : `https://www.reddit.com/r/${subreddit}`;
    const summary = text(post.selftext) || text(post.url_overridden_by_dest) || text(post.domain);
    const publishedAt = post.created_utc
      ? new Date(Number(post.created_utc) * 1000).toISOString()
      : new Date().toISOString();

    opportunities.push({
      external_id: text(post.name || post.id),
      source: 'reddit',
      title: text(post.title) || 'Reddit opportunity',
      organization: `r/${text(post.subreddit) || subreddit}`,
      summary: summary.slice(0, 900),
      url: redditUrl,
      image_url:
        text(post.thumbnail).startsWith('http') ? text(post.thumbnail) : null,
      amount: null,
      currency: 'USD',
      deadline: null,
      tags: [
        'Reddit',
        `r/${text(post.subreddit) || subreddit}`,
        text(post.link_flair_text),
        Number(post.score) ? `${Number(post.score)} upvotes` : '',
      ]
        .filter(Boolean)
        .slice(0, 5),
      status: 'active',
      published_at: publishedAt,
      raw_data: post,
    });
  }
}

const deduped = [
  ...new Map(opportunities.map((item) => [item.external_id, item])).values(),
].slice(0, 120);

const supabase = createClient(supabaseUrl, serviceRoleKey);
const { error: closeError } = await supabase
  .from('opportunities')
  .update({ status: 'closed' })
  .eq('source', 'reddit')
  .eq('status', 'active');
if (closeError) throw closeError;

if (deduped.length > 0) {
  const { error: upsertError } = await supabase
    .from('opportunities')
    .upsert(deduped, { onConflict: 'source,external_id' });
  if (upsertError) throw upsertError;
}

console.log(JSON.stringify({ imported: deduped.length, providers: ['reddit'] }));
