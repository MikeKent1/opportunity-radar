import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

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
const feedUrls = (setting('RSS_FEED_URLS') ?? '')
  .split(/[\n,]+/)
  .map((url) => url.trim())
  .filter(Boolean);

const keywords = (setting('RSS_KEYWORDS') ?? '')
  .split(',')
  .map((keyword) => keyword.trim().toLocaleLowerCase('en-US'))
  .filter(Boolean);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  cdataPropName: 'text',
});

const array = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const text = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('text' in value) return text(value.text);
    if ('#text' in value) return text(value['#text']);
  }
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
};

const firstText = (...values) => {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return '';
};

const itemLink = (item) => {
  if (typeof item.link === 'string') return item.link;
  if (Array.isArray(item.link)) {
    const alternate = item.link.find((link) => link?.rel === 'alternate') ?? item.link[0];
    return text(alternate?.href ?? alternate);
  }
  return text(item.link?.href ?? item.guid ?? item.id);
};

const feedHost = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Curated RSS';
  }
};

const itemDate = (item) => {
  const raw = firstText(item.pubDate, item.published, item.updated, item.date);
  const date = raw ? new Date(raw) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
};

const matchesKeywords = (item) => {
  if (!keywords.length) return true;
  const haystack = `${item.title} ${item.summary} ${item.tags.join(' ')}`.toLocaleLowerCase(
    'en-US',
  );
  return keywords.some((keyword) => haystack.includes(keyword));
};

const opportunities = [];

for (const feedUrl of feedUrls) {
  const response = await fetch(feedUrl, {
    headers: {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      'User-Agent': 'OpportunityRadar/1.0 (+https://github.com/MikeKent1/opportunity-radar)',
    },
  });

  if (!response.ok) {
    console.warn(`RSS feed failed ${feedUrl}: ${response.status}`);
    continue;
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const channel = parsed.rss?.channel ?? parsed.feed ?? {};
  const feedTitle = firstText(channel.title, feedHost(feedUrl));
  const rawItems = [
    ...array(channel.item),
    ...array(channel.entry),
  ].slice(0, 30);

  for (const item of rawItems) {
    const title = firstText(item.title);
    const url = itemLink(item);
    if (!title || !url) continue;

    const categories = array(item.category)
      .map((category) => firstText(category.term, category))
      .filter(Boolean);
    const normalized = {
      external_id: crypto
        .createHash('sha256')
        .update(`${feedUrl}:${firstText(item.guid, item.id, url)}`)
        .digest('hex'),
      source: 'rss',
      title,
      organization: feedTitle,
      summary: firstText(item.description, item.summary, item.content, item['content:encoded']),
      url,
      image_url:
        firstText(
          item.enclosure?.url,
          item['media:thumbnail']?.url,
          item['media:content']?.url,
        ) || null,
      amount: null,
      currency: 'USD',
      deadline: null,
      tags: ['RSS', feedTitle, ...categories].filter(Boolean).slice(0, 5),
      status: 'active',
      published_at: itemDate(item),
      raw_data: { feedUrl, item },
    };

    if (matchesKeywords(normalized)) opportunities.push(normalized);
  }
}

const deduped = [
  ...new Map(opportunities.map((item) => [item.external_id, item])).values(),
].slice(0, 120);

const supabase = createClient(supabaseUrl, serviceRoleKey);
const { error: closeError } = await supabase
  .from('opportunities')
  .update({ status: 'closed' })
  .eq('source', 'rss')
  .eq('status', 'active');
if (closeError) throw closeError;

if (deduped.length > 0) {
  const { error: upsertError } = await supabase
    .from('opportunities')
    .upsert(deduped, { onConflict: 'source,external_id' });
  if (upsertError) throw upsertError;
}

console.log(JSON.stringify({ imported: deduped.length, providers: ['rss'] }));
