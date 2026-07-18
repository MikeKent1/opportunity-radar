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
      providers: ['giveaway-categorization-audit'],
      audited: 0,
      skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }),
  );
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const giveawaySources = ['gamerpower', 'epicgames', 'cheapshark', 'kingsumo'];
const rewardTags = new Set([
  'cash',
  'dlc',
  'game',
  'games',
  'gift card',
  'gift cards',
  'gift_card',
  'hardware',
  'in-game',
  'in_game_item',
  'other',
  'software',
  'trip',
  'trips',
]);

const includesAny = (text, needles) => needles.some((needle) => text.includes(needle));
const moneyAmountPattern = String.raw`(?:[$\u20AC\u00A3]\s?\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?|\b\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?\s?(?:usd|eur|gbp|dollars?|euros?|pounds?)\b)`;
const hasPrizeValueLanguage = (text) =>
  new RegExp(`${moneyAmountPattern}\\+?\\s*(?:in\\s+)?(?:prizes?|value|worth|gear|setup|bundle|package|products?)`, 'i').test(
    text,
  ) || new RegExp(`\\b(?:worth|valued at|value of)\\b.{0,30}${moneyAmountPattern}`, 'i').test(text);
const hasMoneyAmount = (text) =>
  /(?:[$€£]\s?\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?|\b\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?\s?(?:usd|eur|gbp|dollars?|euros?|pounds?)\b)/i.test(
    text,
  );
const hasGiftCard = (text) =>
  includesAny(text, [
    'gift card',
    'giftcard',
    'voucher',
    'store credit',
    'amazon card',
    'steam card',
    'psn card',
    'xbox card',
    'google play card',
    'itunes card',
  ]);
const hasTravel = (text) =>
  /\b(win|wins|winner|winners|get|gets|prize|grand prize|chance to win).{0,90}\b(trips?|flights?|hotel stays?|vacations?|holidays?|getaways?|resorts?|cruises?|flyaways?)\b/i.test(
    text,
  ) ||
  /\b(trips?|flights?|hotel stays?|vacations?|holidays?|getaways?|resorts?|cruises?|flyaways?)\s+(to|in|for|with)\b/i.test(
    text,
  ) ||
  /\b(night stay|hotel stay|stay for two|luxury escape|dream trip|around the world cruise)\b/i.test(
    text,
  );
const hasHardware = (text) =>
  includesAny(text, [
    'keyboard',
    'mouse',
    'headset',
    'monitor',
    'gpu',
    'graphics card',
    'laptop',
    'pc build',
    'gaming pc',
    'chair',
    'cooler',
    'controller',
    'microphone',
    'camera',
    'car',
    'truck',
    'motorcycle',
    'bike',
    'vehicle',
    'speaker',
    'hardware',
    'razer',
    'corsair',
    'logitech',
    'steelseries',
  ]);
const hasInGame = (text) =>
  includesAny(text, [
    'skin',
    'outfit',
    'cloak',
    'weapon',
    'mount',
    'pet',
    'currency',
    'coins',
    'gems',
    'loot',
    'item',
    'in-game',
    'ingame',
  ]);

function buildText(opportunity) {
  const raw = opportunity.raw_data && typeof opportunity.raw_data === 'object' ? opportunity.raw_data : {};
  const tags = Array.isArray(opportunity.tags)
    ? opportunity.tags.filter((tag) => !rewardTags.has(String(tag).toLowerCase()))
    : [];

  return [
    opportunity.title,
    opportunity.summary,
    opportunity.organization,
    opportunity.source,
    ...tags,
    raw.type,
    raw.platforms,
    raw.worth,
    raw.instructions,
    raw.description,
    raw.details,
    raw.title,
  ]
    .join(' ')
    .toLowerCase();
}

function addIssue(issues, severity, expected, reason) {
  issues.push({ severity, expected, reason });
}

function auditOpportunity(opportunity) {
  const text = buildText(opportunity);
  const current = opportunity.subcategory ?? 'other';
  const classifier = classifyRewardType(opportunity);
  const issues = [];

  if (current !== classifier) {
    addIssue(issues, 'high', classifier, `stored subcategory differs from classifier (${classifier})`);
  }

  if (current === 'gift_card' && hasTravel(text)) {
    addIssue(issues, 'high', 'trip', 'gift card bucket includes a strong travel prize signal');
  }

  if (current === 'cash' && hasGiftCard(text) && !includesAny(text, ['cash', 'paypal', 'bank transfer', 'venmo'])) {
    addIssue(issues, 'medium', 'gift_card', 'cash bucket looks more like voucher or store credit');
  }

  if (current === 'trip' && !hasTravel(text) && hasGiftCard(text)) {
    addIssue(issues, 'medium', 'gift_card', 'trip bucket has gift card language but no travel signal');
  }

  if (current === 'hardware' && !hasHardware(text) && hasInGame(text)) {
    addIssue(issues, 'medium', 'in_game_item', 'hardware bucket has in-game item language but no hardware signal');
  }

  if (
    current === 'game' &&
    opportunity.source !== 'gamerpower' &&
    hasInGame(text) &&
    !includesAny(text, ['full game', 'base game', 'steam key'])
  ) {
    addIssue(issues, 'low', 'in_game_item', 'game bucket may be an in-game reward');
  }

  if (current === 'other') {
    if (hasMoneyAmount(text) && !hasPrizeValueLanguage(text)) {
      addIssue(issues, 'medium', 'cash', 'other bucket includes money amount');
    }
    if (hasGiftCard(text)) addIssue(issues, 'medium', 'gift_card', 'other bucket includes gift card language');
    if (hasTravel(text)) addIssue(issues, 'medium', 'trip', 'other bucket includes travel language');
    if (hasHardware(text)) addIssue(issues, 'medium', 'hardware', 'other bucket includes hardware language');
  }

  return issues;
}

const { data, error } = await supabase
  .from('opportunities')
  .select('id, source, source_type, category, subcategory, title, organization, summary, tags, raw_data')
  .eq('status', 'active')
  .or(`source.in.(${giveawaySources.join(',')}),source_type.eq.social,category.eq.giveaways`);

if (error) throw error;

const counts = {};
const issueCounts = {};
const flagged = [];

for (const opportunity of data ?? []) {
  const subcategory = opportunity.subcategory ?? 'other';
  counts[subcategory] = (counts[subcategory] ?? 0) + 1;

  const issues = auditOpportunity(opportunity);
  for (const issue of issues) {
    issueCounts[issue.severity] = (issueCounts[issue.severity] ?? 0) + 1;
  }

  if (issues.length > 0) {
    flagged.push({
      id: opportunity.id,
      title: opportunity.title,
      source: opportunity.source,
      current: subcategory,
      classifier: classifyRewardType(opportunity),
      issues,
    });
  }
}

flagged.sort((left, right) => {
  const score = { high: 0, medium: 1, low: 2 };
  const leftScore = Math.min(...left.issues.map((issue) => score[issue.severity]));
  const rightScore = Math.min(...right.issues.map((issue) => score[issue.severity]));
  return leftScore - rightScore || left.title.localeCompare(right.title);
});

console.log(
  JSON.stringify(
    {
      providers: ['giveaway-categorization-audit'],
      audited: data?.length ?? 0,
      counts,
      issueCounts,
      flagged: flagged.slice(0, 80),
      flaggedTotal: flagged.length,
    },
    null,
    2,
  ),
);
