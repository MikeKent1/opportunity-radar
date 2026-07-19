import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import { classifyRewardTypeWithAi } from './lib/ai-reward-classifier.mjs';
import { enrichGiveawayWithAi } from './lib/ai-giveaway-enrichment.mjs';

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

const defaultSources = [
  {
    id: 'thefreebieguy-social',
    label: 'The Freebie Guy Social Giveaways',
    url: 'https://thefreebieguy.com/social-media-giveaways/',
    organization: 'The Freebie Guy',
    parser: 'generic',
  },
  {
    id: 'thefreebieguy-daily',
    label: 'The Freebie Guy Daily Sweepstakes',
    url: 'https://thefreebieguy.com/daily-entry-sweepstakes-giveaways/',
    organization: 'The Freebie Guy',
    parser: 'generic',
  },
  {
    id: 'freebieshark-rss',
    label: 'FreebieShark RSS',
    url: 'https://www.freebieshark.com/feed/',
    organization: 'FreebieShark',
    parser: 'rss',
  },
  {
    id: 'sweepwidget-directory',
    label: 'SweepWidget Giveaways',
    url: 'https://sweepwidget.com/giveaways/',
    organization: 'SweepWidget',
    parser: 'sweepwidget',
  },
  {
    id: 'luxury-travel-expert',
    label: 'The Luxury Travel Expert Contests',
    url: 'https://theluxurytravelexpert.com/contests/',
    organization: 'The Luxury Travel Expert',
    parser: 'luxury_travel',
  },
];

const configuredSources = (setting('SWEEPSTAKES_WEB_URLS') ?? '')
  .split(/[\n,]+/)
  .map((url) => url.trim())
  .filter(Boolean)
  .map((url, index) => ({
    id: `configured-${index + 1}`,
    label: url,
    url,
    organization: hostName(url),
    parser: url.includes('/feed') ? 'rss' : 'generic',
  }));
const sources = configuredSources.length ? configuredSources : defaultSources;
const maxItems = Number(setting('SWEEPSTAKES_WEB_MAX_ITEMS') ?? 420);
const maxItemsPerSource = Number(setting('SWEEPSTAKES_WEB_MAX_ITEMS_PER_SOURCE') ?? 160);
const sweepWidgetPages = Math.max(1, Number(setting('SWEEPSTAKES_WEB_SWEEPWIDGET_PAGES') ?? 6));

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

function hostName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Sweepstakes Web';
  }
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, ' - ')
    .replace(/&bull;/g, ' - ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-');
}

function stripHtml(value) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?(?:<\/script>|$)/gi, ' ')
    .replace(/<style[\s\S]*?(?:<\/style>|$)/gi, ' ')
    .replace(/<img\b[\s\S]*?(?:>|$)/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(?:loading|decoding|width|height|src|class|alt|title|data-[\w-]+)=["'][^"']*["']/gi, ' ')
    .replace(/^\d{10}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(url, baseUrl) {
  try {
    return new URL(decodeEntities(url), baseUrl).toString();
  } catch {
    return '';
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  cdataPropName: 'text',
});

const array = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const textValue = (value) => {
  if (value == null) return '';
  if (Array.isArray(value)) return textValue(value[0]);
  if (typeof value === 'object') {
    if ('text' in value) return textValue(value.text);
    if ('#text' in value) return textValue(value['#text']);
  }
  return stripHtml(String(value));
};

const firstText = (...values) => {
  for (const value of values) {
    const candidate = textValue(value);
    if (candidate) return candidate;
  }
  return '';
};

function itemLink(item) {
  if (typeof item.link === 'string') return item.link;
  if (Array.isArray(item.link)) {
    const alternate = item.link.find((link) => link?.rel === 'alternate') ?? item.link[0];
    return textValue(alternate?.href ?? alternate);
  }
  return textValue(item.link?.href ?? item.guid ?? item.id);
}

function itemDate(item) {
  const raw = firstText(item.pubDate, item.published, item.updated, item.date);
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function parseDeadline(text) {
  const normalized = stripHtml(text);
  const monthMatch = normalized.match(
    /\b(?:ends?|end date:?)\s+([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*)?(\d{4})?/i,
  );
  if (monthMatch) {
    const [, month, day, year] = monthMatch;
    const parsed = new Date(`${month} ${day}, ${year ?? new Date().getUTCFullYear()} 23:59:00 UTC`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const slashMatch = normalized.match(/\bends?\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i);
  if (slashMatch) {
    const [, month, day, rawYear] = slashMatch;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

function parseRelativeDaysDeadline(text) {
  const match = stripHtml(text).match(/\b(\d{1,3})\s+days?\s+left\b/i);
  if (!match) return null;

  const parsed = new Date(Date.now() + Number(match[1]) * 86_400_000);
  parsed.setUTCHours(23, 59, 0, 0);
  return parsed.toISOString();
}

function looksLikeGiveaway(title, details, url) {
  const haystack = `${title} ${details} ${url}`.toLowerCase();
  if (/report-a-dead-deal|wp-comments-post|#respond|privacy|contact|about/.test(haystack)) {
    return false;
  }

  if (/^https:\/\/www\.instagram\.com\/[^/]+\/?$/i.test(url)) return false;
  if (/^https:\/\/www\.facebook\.com\/[^/]+\/?$/i.test(url)) return false;
  if (/^(the freebie guy|telegram|facebook group|freebies sweeps|sweepstakes|giveaways)$/i.test(title.trim())) {
    return false;
  }
  if (/^https:\/\/thefreebieguy\.com\/(sweepstakes|giveaways)\/?$/i.test(url)) return false;

  return (
    /\b(giveaway|sweepstakes?|contest|win|winner|prize|gift card|cash|trip|vacation)\b/.test(
      haystack,
    ) ||
    /\b\d+\s+winners?\b/.test(haystack) ||
    /\b(one time|daily)\s+entry\b/.test(haystack) ||
    /\bends?\s+[a-z]+\s+\d{1,2}/i.test(haystack)
  );
}

function extractCandidates(html, source) {
  const entryStart = html.search(/<div[^>]+class=["'][^"']*entry-content/i);
  const body = entryStart >= 0 ? html.slice(entryStart) : html;
  const candidates = [];
  const anchorRegex = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of body.matchAll(anchorRegex)) {
    const [, beforeAttrs, href, afterAttrs, labelHtml] = match;
    const attrs = `${beforeAttrs} ${afterAttrs}`;
    const title = stripHtml(labelHtml);
    const url = absoluteUrl(href, source.url);
    if (!title || !url || title.length < 5 || title.length > 180) continue;

    const contextHtml = body.slice(match.index, match.index + 850);
    const details = stripHtml(contextHtml).replace(title, '').trim();
    if (!looksLikeGiveaway(title, details, url)) continue;

    const isEntryLink =
      /instagram\.com\/(p|reel|reels)\//i.test(url) ||
      /facebook\.com\/.*(posts|pfbid|story)/i.test(url) ||
      /x\.com|twitter\.com|tiktok\.com|gleam\.io|woobox\.com|promosimple\.com|app\.viralsweep\.com|sweepwidget\.com|thefreebieguy\.com\/sweepstakes\//i.test(
        url,
      ) ||
      /external|noopener|nofollow/i.test(attrs);
    if (!isEntryLink) continue;

    candidates.push({
      title,
      url,
      details,
      deadline: parseDeadline(details),
      sourcePage: source.url,
      organization: source.organization,
      sourceLabel: source.label,
    });
  }

  return candidates;
}

function extractRssCandidates(xml, source) {
  const parsed = xmlParser.parse(xml);
  const channelItems = array(parsed?.rss?.channel?.item);
  const atomItems = array(parsed?.feed?.entry);
  const items = channelItems.length ? channelItems : atomItems;

  return items
    .map((item) => {
      const title = firstText(item.title);
      const url = absoluteUrl(itemLink(item), source.url);
      const details = firstText(item.description, item['content:encoded'], item.content, item.summary);

      return {
        title,
        url,
        details,
        deadline: parseDeadline(`${title} ${details}`),
        sourcePage: source.url,
        organization: source.organization,
        sourceLabel: source.label,
        publishedAt: itemDate(item),
      };
    })
    .filter((candidate) => candidate.title && candidate.url)
    .filter((candidate) => looksLikeGiveaway(candidate.title, candidate.details, candidate.url));
}

function extractSweepWidgetCandidates(html, source) {
  const candidates = [];
  const seenUrls = new Set();
  const anchorRegex =
    /<h3\b[^>]*class=["'][^"']*card-title[^"']*["'][\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const [, href, labelHtml] = match;
    const url = absoluteUrl(href, source.url);
    if (!/^https:\/\/sweepwidget\.com\/giveaways\/[^/?#]+/i.test(url) || seenUrls.has(url)) {
      continue;
    }

    const title = stripHtml(labelHtml);
    const nextCard = html.indexOf('<h3', match.index + 1);
    const contextHtml = html.slice(
      match.index,
      nextCard > match.index ? nextCard : match.index + 1600,
    );
    const details = stripHtml(contextHtml).replace(title, '').trim();
    if (!looksLikeGiveaway(title, details, url)) continue;

    seenUrls.add(url);
    candidates.push({
      title,
      url,
      details,
      deadline: parseRelativeDaysDeadline(details),
      sourcePage: source.url,
      organization: source.organization,
      sourceLabel: source.label,
    });
  }

  return candidates;
}

function extractSweepWidgetDetail(html) {
  const titleStart = html.search(/<h1\b/i);
  const moreStart = html.search(/<h2\b[^>]*>\s*More Free Giveaways to Enter\s*<\/h2>/i);
  const body = titleStart >= 0
    ? html.slice(titleStart, moreStart > titleStart ? moreStart : titleStart + 6000)
    : html.slice(0, moreStart > 0 ? moreStart : 6000);
  return stripHtml(body);
}

async function fetchCandidateDetails(candidate) {
  if (!/^https:\/\/sweepwidget\.com\/giveaways\/[^/?#]+/i.test(candidate.url)) {
    return candidate;
  }

  try {
    const response = await fetch(candidate.url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'OpportunityRadar/1.0 (+https://github.com/MikeKent1/opportunity-radar)',
      },
    });
    if (!response.ok) return candidate;

    const detailText = extractSweepWidgetDetail(await response.text());
    if (!detailText || detailText.length < candidate.details.length) return candidate;

    return {
      ...candidate,
      details: detailText,
      detailPageText: detailText,
    };
  } catch {
    return candidate;
  }
}

function extractLuxuryTravelCandidates(html, source) {
  const candidates = [];
  const contestRegex =
    /Win\s+(a|an)\s+<strong>([\s\S]*?)<\/strong>([\s\S]*?)End date:\s*([^<]+)[\s\S]*?Enter the travel contest:[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(contestRegex)) {
    const [, article, prizeHtml, descriptionHtml, endDate, href] = match;
    const prize = stripHtml(prizeHtml);
    const title = `Win ${article} ${prize}`;
    const url = absoluteUrl(href, source.url);
    const details = stripHtml(`Win ${article} ${prize}. ${descriptionHtml} End date: ${endDate}`);
    if (!looksLikeGiveaway(title, details, url)) continue;

    candidates.push({
      title,
      url,
      details,
      deadline: parseDeadline(`End date: ${endDate}`),
      sourcePage: source.url,
      organization: source.organization,
      sourceLabel: source.label,
    });
  }

  return candidates;
}

function extractSourceCandidates(body, source, contentType) {
  if (source.parser === 'rss' || contentType.includes('xml') || body.trimStart().startsWith('<?xml')) {
    return extractRssCandidates(body, source);
  }

  if (source.parser === 'sweepwidget') return extractSweepWidgetCandidates(body, source);
  if (source.parser === 'luxury_travel') return extractLuxuryTravelCandidates(body, source);

  return extractCandidates(body, source);
}

function pagedUrl(url, page) {
  if (page <= 1) return url;

  const parsed = new URL(url);
  parsed.searchParams.set('page', String(page));
  return parsed.toString();
}

function sourceUrls(source) {
  if (source.parser !== 'sweepwidget') return [source.url];

  return Array.from({ length: sweepWidgetPages }, (_, index) => pagedUrl(source.url, index + 1));
}

async function normalizeCandidate(candidate) {
  const detailedCandidate = await fetchCandidateDetails(candidate);
  const summary = detailedCandidate.details || detailedCandidate.title;
  const classification = await classifyRewardTypeWithAi({
    source: 'sweepstakes_web',
    source_type: 'web',
    title: detailedCandidate.title,
    summary,
    tags: ['Sweepstakes', 'Web'],
  });
  const { subcategory } = classification;
  const enrichment = await enrichGiveawayWithAi({
    source: 'sweepstakes_web',
    source_type: 'web',
    category: 'giveaways',
    subcategory,
    title: detailedCandidate.title,
    summary,
    organization: detailedCandidate.organization,
    deadline: detailedCandidate.deadline,
    tags: ['Sweepstakes', 'Web', detailedCandidate.sourceLabel, subcategory].filter(Boolean),
    raw_data: {
      provider: 'sweepstakes:web',
      sourcePage: detailedCandidate.sourcePage,
      sourceLabel: detailedCandidate.sourceLabel,
      details: detailedCandidate.details,
      detailPageText: detailedCandidate.detailPageText,
    },
  });

  return {
    external_id: hash(`${detailedCandidate.url}:${detailedCandidate.title}`),
    source: 'sweepstakes_web',
    source_type: 'web',
    category: 'giveaways',
    subcategory,
    classification_method: classification.classification_method,
    classification_confidence: classification.classification_confidence,
    classification_reason: classification.classification_reason,
    needs_review: classification.needs_review,
    clean_summary: enrichment.clean_summary,
    prize_description: enrichment.prize_description,
    eligibility: enrichment.eligibility,
    eligible_countries: enrichment.eligible_countries,
    localities: enrichment.localities,
    quality_score: enrichment.quality_score,
    risk_flags: enrichment.risk_flags,
    quality_notes: enrichment.quality_notes,
    enrichment_method: enrichment.enrichment_method,
    enrichment_reason: enrichment.enrichment_reason,
    title: detailedCandidate.title,
    organization: detailedCandidate.organization,
    summary: summary.slice(0, 700),
    url: detailedCandidate.url,
    participation_url: detailedCandidate.url,
    image_url: null,
    amount: null,
    currency: 'USD',
    deadline: detailedCandidate.deadline,
    expires_at: detailedCandidate.deadline,
    participation_steps: ['Open the official entry link', 'Read eligibility and rules', 'Complete the required entry steps'],
    tags: ['Sweepstakes', 'Web', candidate.sourceLabel, subcategory].filter(Boolean).slice(0, 6),
    status: 'active',
    published_at: detailedCandidate.publishedAt ?? new Date().toISOString(),
    raw_data: {
      provider: 'sweepstakes:web',
      sourcePage: detailedCandidate.sourcePage,
      sourceLabel: detailedCandidate.sourceLabel,
      details: detailedCandidate.details,
      detailPageText: detailedCandidate.detailPageText,
      classification,
      enrichment,
    },
  };
}

const fetchErrors = [];
const candidates = [];

for (const source of sources) {
  try {
    const sourceCandidates = [];

    for (const url of sourceUrls(source)) {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml,text/xml',
          'User-Agent': 'OpportunityRadar/1.0 (+https://github.com/MikeKent1/opportunity-radar)',
        },
      });

      if (!response.ok) {
        fetchErrors.push(`${source.label}: HTTP ${response.status}`);
        continue;
      }

      const body = await response.text();
      const contentType = response.headers.get('content-type') ?? '';
      sourceCandidates.push(
        ...extractSourceCandidates(body, { ...source, url }, contentType),
      );
    }

    candidates.push(...sourceCandidates.slice(0, maxItemsPerSource));
  } catch (error) {
    fetchErrors.push(`${source.label}: ${error.message}`);
  }
}

const now = Date.now();
const normalizedCandidates = await Promise.all(candidates.map((candidate) => normalizeCandidate(candidate)));
const deduped = [
  ...new Map(
    normalizedCandidates
      .filter((item) => !item.deadline || new Date(item.deadline).getTime() >= now - 86_400_000)
      .map((item) => [item.external_id, item]),
  ).values(),
].slice(0, maxItems);

const supabase = createClient(supabaseUrl, serviceRoleKey);

if (deduped.length > 0) {
  const { error: closeError } = await supabase
    .from('opportunities')
    .update({ status: 'closed' })
    .eq('source', 'sweepstakes_web')
    .eq('status', 'active');
  if (closeError) throw closeError;

  const { error: upsertError } = await supabase
    .from('opportunities')
    .upsert(deduped, { onConflict: 'source,external_id' });
  if (upsertError) throw upsertError;
}

console.log(
  JSON.stringify({
    imported: deduped.length,
    providers: ['sweepstakes:web'],
    sources: sources.length,
    sweepWidgetPages,
    candidates: candidates.length,
    skipped: fetchErrors.length ? fetchErrors.slice(0, 3).join(' | ') : '',
  }),
);
