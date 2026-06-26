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
const apiKey = setting('PRODUCT_HUNT_API_KEY');
const apiSecret = setting('PRODUCT_HUNT_API_SECRET');
let accessToken = setting('PRODUCT_HUNT_ACCESS_TOKEN');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

if (!accessToken && (!apiKey || !apiSecret)) {
  throw new Error(
    'Missing PRODUCT_HUNT_ACCESS_TOKEN or PRODUCT_HUNT_API_KEY/PRODUCT_HUNT_API_SECRET',
  );
}

if (!accessToken) {
  const tokenResponse = await fetch('https://api.producthunt.com/v2/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      grant_type: 'client_credentials',
    }),
  });

  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(JSON.stringify(tokenPayload));
  accessToken = tokenPayload.access_token;
}

const query = `
  query LatestPosts {
    posts(first: 50, order: NEWEST) {
      edges {
        node {
          id
          name
          tagline
          description
          url
          website
          votesCount
          commentsCount
          createdAt
          featuredAt
          thumbnail {
            url
          }
          topics(first: 5) {
            edges {
              node {
                name
              }
            }
          }
        }
      }
    }
  }
`;

const response = await fetch('https://api.producthunt.com/v2/api/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

const payload = await response.json();
if (!response.ok || payload.errors) throw new Error(JSON.stringify(payload));

const text = (value) => String(value ?? '').trim();
const nodes = payload.data?.posts?.edges?.map((edge) => edge?.node).filter(Boolean) ?? [];

const opportunities = nodes.map((item) => {
  const publishedAt = text(item.featuredAt || item.createdAt);
  const topics =
    item.topics?.edges
      ?.map((edge) => text(edge?.node?.name))
      .filter(Boolean)
      .slice(0, 4) ?? [];

  return {
    external_id: text(item.id),
    source: 'producthunt',
    title: text(item.name) || 'Product Hunt launch',
    organization: 'Product Hunt',
    summary: text(item.tagline || item.description),
    url: text(item.url || item.website || 'https://www.producthunt.com/'),
    image_url: text(item.thumbnail?.url) || null,
    amount: null,
    currency: 'USD',
    deadline: null,
    tags: [
      'Launch',
      Number(item.votesCount) ? `${Number(item.votesCount)} upvotes` : '',
      ...topics,
    ]
      .filter(Boolean)
      .slice(0, 5),
    status: 'active',
    published_at: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
    raw_data: item,
  };
});

const supabase = createClient(supabaseUrl, serviceRoleKey);
const { error: closeError } = await supabase
  .from('opportunities')
  .update({ status: 'closed' })
  .eq('source', 'producthunt')
  .eq('status', 'active');
if (closeError) throw closeError;

if (opportunities.length > 0) {
  const { error: upsertError } = await supabase
    .from('opportunities')
    .upsert(opportunities, { onConflict: 'source,external_id' });
  if (upsertError) throw upsertError;
}

console.log(JSON.stringify({ imported: opportunities.length, providers: ['producthunt'] }));
