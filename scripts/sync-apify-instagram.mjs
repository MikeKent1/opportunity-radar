import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { enrichGiveawayWithAi } from './lib/ai-giveaway-enrichment.mjs';
import { classifyRewardTypeWithAi } from './lib/ai-reward-classifier.mjs';

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
const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

const supabaseUrl = setting('EXPO_PUBLIC_SUPABASE_URL');
const serviceRoleKey = setting('SUPABASE_SERVICE_ROLE_KEY');
const apifyToken = setting('APIFY_TOKEN');
const instagramActorId = setting('INSTAGRAM_ACTOR_ID');
const instagramActorMode = lower(setting('INSTAGRAM_ACTOR_MODE'));
const sourceUsernames = new Set(
  text(setting('INSTAGRAM_SOURCE_USERNAMES'))
    .split(/[,\s]+/)
    .map((username) => username.trim().toLowerCase())
    .filter(Boolean),
);
const postsLimit = Number(setting('INSTAGRAM_POSTS_LIMIT') ?? 2);
const apifyTimeoutMs = Number(setting('APIFY_TIMEOUT_MS') ?? 180_000);
const rotationBuckets = Math.max(1, Number(setting('INSTAGRAM_ROTATION_BUCKETS') ?? 1));
const rotationBucketOverride = setting('INSTAGRAM_ROTATION_BUCKET');
const newerThanDays = Number(setting('INSTAGRAM_NEWER_THAN_DAYS') ?? 5);
const apifyMonthlyUsageGuardUsd = Number(setting('APIFY_MONTHLY_USAGE_GUARD_USD') ?? 4.25);

const finish = (payload) => {
  console.log(JSON.stringify({ providers: ['apify-instagram'], ...payload }));
};

if (!supabaseUrl || !serviceRoleKey) {
  finish({
    imported: 0,
    skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  });
  process.exit(0);
}

if (!apifyToken || !instagramActorId) {
  finish({
    imported: 0,
    skipped: 'Missing APIFY_TOKEN or INSTAGRAM_ACTOR_ID',
  });
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function loadApifyMonthlyUsageUsd() {
  if (!Number.isFinite(apifyMonthlyUsageGuardUsd) || apifyMonthlyUsageGuardUsd <= 0) {
    return null;
  }

  const response = await fetch('https://api.apify.com/v2/users/me/usage/monthly', {
    headers: { Authorization: `Bearer ${apifyToken}` },
  });
  if (!response.ok) {
    errors.push(`Apify usage check failed: HTTP ${response.status}`);
    return null;
  }

  const payload = await response.json();
  return Number(payload?.data?.totalUsageCreditsUsdAfterVolumeDiscount ?? 0);
}

const giveawayKeywords = [
  'giveaway',
  'win',
  'winner',
  'prize',
  'enter',
  'follow',
  'comment',
  'tag',
  'share',
  'contest',
  'sweepstakes',
];

const hash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 16);
const hashNumber = (value) => Number.parseInt(hash(value).slice(0, 8), 16);

function normalizeActorId(actorId) {
  return actorId.includes('/') ? actorId.replace('/', '~') : actorId;
}

function isLowcostActor(actorId) {
  return (
    instagramActorMode === 'lowcost' ||
    lower(actorId).includes('instagram-posts-scraper-lowcost')
  );
}

function getCurrentRotationBucket() {
  if (rotationBucketOverride) {
    const parsed = Number(rotationBucketOverride);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed)) % rotationBuckets;
  }

  return Math.floor(Date.now() / 86_400_000) % rotationBuckets;
}

function sourceMatchesRotation(source, currentBucket) {
  if (sourceUsernames.size > 0 || rotationBuckets <= 1) return true;
  return hashNumber(source.username) % rotationBuckets === currentBucket;
}

function getCaption(item) {
  if (item.caption && typeof item.caption === 'object') {
    return text(item.caption.text ?? item.caption.caption ?? item.caption.value);
  }

  return text(
    item.caption ??
      item.text ??
      item.description ??
      item.alt ??
      item.edge_media_to_caption?.edges?.[0]?.node?.text,
  );
}

function getPostUrl(item, username) {
  const shortcode = text(item.shortCode ?? item.shortcode ?? item.code);
  return text(item.url ?? item.postUrl ?? item.post_url ?? item.permalink) ||
    (shortcode ? `https://www.instagram.com/p/${shortcode}/` : `https://www.instagram.com/${username}/`);
}

function getPlatformPostId(item, postUrl) {
  return (
    text(item.id ?? item.pk ?? item.shortCode ?? item.shortcode ?? item.code ?? item.postId) ||
    `url-${hash(postUrl)}`
  );
}

function getPostedAt(item) {
  const value =
    item.timestamp ??
    item.takenAtTimestamp ??
    item.createdAt ??
    item.date ??
    item.postedAt ??
    item.taken_at;

  if (!value) return null;
  if (typeof value === 'number') {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isRecentEnough(postedAt) {
  if (!postedAt || !Number.isFinite(newerThanDays) || newerThanDays <= 0) return true;

  const postedTime = new Date(postedAt).getTime();
  if (Number.isNaN(postedTime)) return true;

  return postedTime >= new Date(daysAgo(newerThanDays)).getTime();
}

async function detectGiveaway(caption) {
  const normalized = lower(caption);
  const matchedKeywords = giveawayKeywords.filter((keyword) => normalized.includes(keyword));
  const looksLikeGiveaway =
    matchedKeywords.includes('giveaway') ||
    matchedKeywords.includes('sweepstakes') ||
    matchedKeywords.includes('contest') ||
    matchedKeywords.length >= 3;

  if (!looksLikeGiveaway) {
    return { isGiveaway: false, subcategory: null, matchedKeywords };
  }

  const classification = await classifyRewardTypeWithAi({
    source: 'instagram',
    source_type: 'social',
    title: caption,
    summary: caption,
    tags: matchedKeywords,
  });
  return { isGiveaway: true, subcategory: classification.subcategory, matchedKeywords, classification };
}

function buildTitle(caption, source) {
  const clean = caption.replace(/\s+/g, ' ').trim();
  if (!clean) return `${source.display_name || source.username} Instagram giveaway`;
  return clean.length > 88 ? `${clean.slice(0, 85).trim()}...` : clean;
}

function buildParticipationSteps(caption) {
  const normalized = lower(caption);
  return [
    normalized.includes('follow') ? 'Follow the Instagram account' : '',
    normalized.includes('comment') ? 'Comment on the post' : '',
    normalized.includes('tag') ? 'Tag friends if requested' : '',
    normalized.includes('share') ? 'Share the post/story if requested' : '',
  ].filter(Boolean);
}

function getUsernameFromUrl(value) {
  const match = text(value).match(/instagram\.com\/([^/?#]+)/i);
  return match?.[1]?.toLowerCase() ?? '';
}

function getSourceUsername(item) {
  return lower(
    item.scraped_username ??
      item.ownerUsername ??
      item.owner?.username ??
      item.user?.username ??
      item.username ??
      item.profileUsername ??
      item.inputUsername ??
      getUsernameFromUrl(item.inputUrl ?? item.pageUrl ?? item.dataSource?.url),
  );
}

function getImageUrl(item) {
  return (
    text(
      item.displayUrl ??
        item.display_url ??
        item.imageUrl ??
        item.image_url ??
        item.thumbnailUrl ??
        item.thumbnail_url ??
        item.user?.profile_pic_url,
    ) ||
    text(item.image_versions2?.candidates?.[0]?.url) ||
    text(item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url) ||
    null
  );
}

function buildActorInput(sources, options = {}) {
  if (isLowcostActor(instagramActorId)) {
    return {
      usernames: sources.map((source) => source.username),
      postsPerProfile: postsLimit,
      ...(options.newerThan ? { newerThan: options.newerThan } : {}),
      proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
      delayBetweenProfiles: Number(setting('INSTAGRAM_DELAY_BETWEEN_PROFILES_MS') ?? 1000),
      delayBetweenRequests: Number(setting('INSTAGRAM_DELAY_BETWEEN_REQUESTS_MS') ?? 600),
      maxRetries: Number(setting('INSTAGRAM_MAX_RETRIES') ?? 3),
    };
  }

  return {
    directUrls: sources.map((source) => `https://www.instagram.com/${source.username}/`),
    resultsType: 'posts',
    resultsLimit: postsLimit,
    addParentData: true,
  };
}

async function fetchLatestPosts(sources, options = {}) {
  const actorId = normalizeActorId(instagramActorId);
  const url = new URL(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`);
  url.searchParams.set('token', apifyToken);
  url.searchParams.set('clean', 'true');
  url.searchParams.set('format', 'json');

  const input = buildActorInput(sources, options);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apifyTimeoutMs);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: controller.signal,
  });
  clearTimeout(timer);

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(JSON.stringify(payload ?? { status: response.status, statusText: response.statusText }));
  }

  return Array.isArray(payload) ? payload : payload?.items ?? [];
}

function subtractMinutes(value, minutes) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setMinutes(date.getMinutes() - minutes);
  return date.toISOString();
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

async function loadLatestPostedAtBySource(sources) {
  if (!isLowcostActor(instagramActorId) || sources.length === 0) return new Map();

  const { data, error } = await supabase
    .from('social_posts')
    .select('source_id, posted_at')
    .in(
      'source_id',
      sources.map((source) => source.id),
    )
    .not('posted_at', 'is', null)
    .order('posted_at', { ascending: false });

  if (error) throw error;

  const latestBySource = new Map();
  for (const post of data ?? []) {
    if (!latestBySource.has(post.source_id)) {
      latestBySource.set(post.source_id, post.posted_at);
    }
  }

  return latestBySource;
}

async function fetchLatestPostsForSources(sources) {
  if (!isLowcostActor(instagramActorId)) {
    return fetchLatestPosts(sources);
  }

  if (newerThanDays > 0) {
    return fetchLatestPosts(sources, { newerThan: daysAgo(newerThanDays) });
  }

  const latestBySource = await loadLatestPostedAtBySource(sources);
  const lookbackMinutes = Number(setting('INSTAGRAM_NEWER_THAN_LOOKBACK_MINUTES') ?? 30);
  const newSources = [];
  const existingSources = [];
  const existingDates = [];

  for (const source of sources) {
    const latestPostedAt = latestBySource.get(source.id);
    if (!latestPostedAt) {
      newSources.push(source);
      continue;
    }

    existingSources.push(source);
    existingDates.push(new Date(latestPostedAt));
  }

  const posts = [];
  if (newSources.length > 0) {
    posts.push(...(await fetchLatestPosts(newSources)));
  }

  if (existingSources.length > 0) {
    const timestamps = existingDates
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.getTime());
    const oldestLatestDate = timestamps.length ? new Date(Math.min(...timestamps)) : null;
    const newerThan = oldestLatestDate
      ? subtractMinutes(oldestLatestDate.toISOString(), lookbackMinutes)
      : null;
    posts.push(...(await fetchLatestPosts(existingSources, { newerThan })));
  }

  return posts;
}

const { data: sources, error: sourcesError } = await supabase
  .from('social_sources')
  .select('id, platform, username, display_name, category')
  .eq('platform', 'instagram')
  .eq('enabled', true)
  .order('created_at', { ascending: true });

if (sourcesError) throw sourcesError;

let imported = 0;
let postsSaved = 0;
const errors = [];

try {
  const currentRotationBucket = getCurrentRotationBucket();
  const monthlyUsageUsd = await loadApifyMonthlyUsageUsd();
  if (monthlyUsageUsd !== null && monthlyUsageUsd >= apifyMonthlyUsageGuardUsd) {
    finish({
      imported: 0,
      postsSaved: 0,
      actorMode: isLowcostActor(instagramActorId) ? 'lowcost' : 'legacy',
      actorId: instagramActorId,
      rotation: {
        buckets: rotationBuckets,
        bucket: currentRotationBucket,
        selectedSources: 0,
        totalSources: sources?.length ?? 0,
        bypassed: sourceUsernames.size > 0,
      },
      apifyUsage: {
        monthlyUsageUsd,
        guardUsd: apifyMonthlyUsageGuardUsd,
      },
      skipped: `Apify monthly usage ${monthlyUsageUsd.toFixed(2)} reached guard ${apifyMonthlyUsageGuardUsd.toFixed(
        2,
      )}`,
    });
    process.exit(0);
  }

  const enabledSources = (sources ?? []).filter(
    (source) =>
      (sourceUsernames.size === 0 || sourceUsernames.has(source.username.toLowerCase())) &&
      sourceMatchesRotation(source, currentRotationBucket),
  );
  const sourceByUsername = new Map(enabledSources.map((source) => [source.username.toLowerCase(), source]));
  const sourceStats = Object.fromEntries(
    enabledSources.map((source) => [
      source.username,
      {
        category: source.category,
        posts: 0,
        giveawayPosts: 0,
        opportunities: 0,
      },
    ]),
  );
  const posts = enabledSources.length ? await fetchLatestPostsForSources(enabledSources) : [];

  const socialPosts = (
    await Promise.all(posts.map(async (item) => {
      const username = getSourceUsername(item);
      const source = sourceByUsername.get(username);
      if (!source) return null;

      const caption = getCaption(item);
      const postUrl = getPostUrl(item, source.username);
      const platformPostId = getPlatformPostId(item, postUrl);
      const postedAt = getPostedAt(item);
      const detection = await detectGiveaway(caption);

      return {
        source,
        source_id: source.id,
        platform_post_id: platformPostId,
        post_url: postUrl,
        caption,
        posted_at: postedAt,
        raw_data: { ...item, detection },
        ai_status: detection.isGiveaway ? 'rule_giveaway' : 'rule_not_giveaway',
      };
    }))
  )
    .filter(Boolean)
    .filter((post) => isRecentEnough(post.posted_at));

  for (const post of socialPosts) {
    const stats = sourceStats[post.source.username];
    if (!stats) continue;
    stats.posts += 1;
    if (post.raw_data.detection.isGiveaway) stats.giveawayPosts += 1;
  }

  if (socialPosts.length > 0) {
    const { data: existingPosts, error: existingPostsError } = await supabase
      .from('social_posts')
      .select('post_url, platform_post_id')
      .in(
        'post_url',
        socialPosts.map((post) => post.post_url),
      );

    if (existingPostsError) throw existingPostsError;

    const existingPostIdsByUrl = new Map(
      (existingPosts ?? []).map((post) => [post.post_url, post.platform_post_id]),
    );
    for (const post of socialPosts) {
      post.platform_post_id = existingPostIdsByUrl.get(post.post_url) ?? post.platform_post_id;
    }

    const { error: postsError } = await supabase
      .from('social_posts')
      .upsert(
        socialPosts.map(({ source, ...post }) => post),
        { onConflict: 'source_id,platform_post_id', ignoreDuplicates: true },
      );

    if (postsError) throw postsError;
    postsSaved += socialPosts.length;
  }

  const opportunities = await Promise.all(socialPosts
    .filter((post) => post.raw_data.detection.isGiveaway)
    .map(async (post) => {
      const title = buildTitle(post.caption, post.source);
      const participationSteps = buildParticipationSteps(post.caption);
      const tags = [
        'Instagram',
        'Social',
        post.raw_data.detection.subcategory,
        ...post.raw_data.detection.matchedKeywords.slice(0, 3),
      ].filter(Boolean);
      const enrichment = await enrichGiveawayWithAi({
        source: post.source.username,
        source_type: 'social',
        category: 'giveaways',
        subcategory: post.raw_data.detection.subcategory,
        title,
        organization: post.source.display_name || `@${post.source.username}`,
        summary: post.caption,
        deadline: null,
        participation_steps: participationSteps,
        tags,
        raw_data: post.raw_data,
      });

      return {
        external_id: `instagram:${post.platform_post_id}`,
        source: post.source.username,
        source_type: 'social',
        category: 'giveaways',
        subcategory: post.raw_data.detection.subcategory,
        classification_method:
          post.raw_data.detection.classification?.classification_method ?? 'rules',
        classification_confidence:
          post.raw_data.detection.classification?.classification_confidence ?? null,
        classification_reason:
          post.raw_data.detection.classification?.classification_reason ?? null,
        needs_review: post.raw_data.detection.classification?.needs_review ?? false,
        clean_summary: enrichment.clean_summary,
        prize_description: enrichment.prize_description,
        eligibility: enrichment.eligibility,
        quality_score: enrichment.quality_score,
        risk_flags: enrichment.risk_flags,
        quality_notes: enrichment.quality_notes,
        enrichment_method: enrichment.enrichment_method,
        enrichment_reason: enrichment.enrichment_reason,
        title,
        organization: post.source.display_name || `@${post.source.username}`,
        summary: post.caption,
        url: post.post_url,
        participation_url: post.post_url,
        image_url: getImageUrl(post.raw_data),
        amount: null,
        currency: 'USD',
        deadline: null,
        expires_at: null,
        participation_steps: participationSteps,
        tags,
        status: 'active',
        published_at: post.posted_at ?? new Date().toISOString(),
        raw_data: {
          source: post.source,
          post: post.raw_data,
          detector: post.raw_data.detection.classification?.classification_method ?? 'rules',
          enrichment,
        },
      };
    }));

  for (const opportunity of opportunities) {
    const stats = sourceStats[opportunity.source];
    if (stats) stats.opportunities += 1;
  }

  if (opportunities.length > 0) {
    const { error: opportunityError } = await supabase
      .from('opportunities')
      .upsert(opportunities, { onConflict: 'source,external_id', ignoreDuplicates: true });

    if (opportunityError) throw opportunityError;
    imported += opportunities.length;
  }

  if (enabledSources.length > 0) {
    const { error: updateError } = await supabase
      .from('social_sources')
      .update({ last_checked_at: new Date().toISOString() })
      .in(
        'id',
        enabledSources.map((source) => source.id),
      );

    if (updateError) throw updateError;
  }

  finish({
    imported,
    postsSaved,
    deduplicated: 0,
    actorMode: isLowcostActor(instagramActorId) ? 'lowcost' : 'legacy',
    actorId: instagramActorId,
    rotation: {
      buckets: rotationBuckets,
      bucket: currentRotationBucket,
      selectedSources: enabledSources.length,
      totalSources: sources?.length ?? 0,
      bypassed: sourceUsernames.size > 0,
    },
    apifyUsage:
      monthlyUsageUsd === null
        ? null
        : {
            monthlyUsageUsd,
            guardUsd: apifyMonthlyUsageGuardUsd,
          },
    note:
      rotationBuckets > 1 && sourceUsernames.size === 0
        ? `Rotation bucket ${currentRotationBucket + 1}/${rotationBuckets}, selected ${enabledSources.length}/${sources?.length ?? 0} sources`
        : '',
    sourceStats,
    errors,
    skipped: errors.length
      ? `Errors: ${errors.slice(0, 3).join(' | ')}`
      : sources?.length
        ? ''
        : 'No enabled Instagram social sources found',
  });
  process.exit(errors.length ? 1 : 0);
} catch (error) {
  errors.push(error.name === 'AbortError' ? `Apify request timed out after ${apifyTimeoutMs}ms` : error.message);
}

finish({
  imported,
  postsSaved,
  deduplicated: 0,
  actorMode: isLowcostActor(instagramActorId) ? 'lowcost' : 'legacy',
  actorId: instagramActorId,
  rotation: {
    buckets: rotationBuckets,
    bucket: getCurrentRotationBucket(),
    selectedSources: 0,
    totalSources: sources?.length ?? 0,
    bypassed: sourceUsernames.size > 0,
  },
  errors,
  skipped: errors.length
    ? `Errors: ${errors.slice(0, 3).join(' | ')}`
    : sources?.length
      ? ''
      : 'No enabled Instagram social sources found',
});

if (errors.length === (sources?.length ?? 0) && errors.length > 0) {
  process.exit(1);
}
