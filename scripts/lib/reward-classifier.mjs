const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const moneyAmountPattern = String.raw`(?:[$\u20AC\u00A3]\s?\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?|\b\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?\s?(?:usd|eur|gbp|dollars?|euros?|pounds?)\b)`;

const includesAny = (haystack, needles) => needles.some((needle) => haystack.includes(needle));
const hasMoneyAmount = (haystack) =>
  /(?:[$€£]\s?\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?|\b\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?\s?(?:usd|eur|gbp|dollars?|euros?|pounds?)\b)/i.test(
    haystack,
  );
const hasShortMoneyAmount = (haystack) => /[$€£]\s?\d+(?:\.\d+)?\s?k\b/i.test(haystack);
const hasPrizeValueLanguage = (haystack) =>
  new RegExp(`${moneyAmountPattern}\\+?\\s*(?:in\\s+)?(?:prizes?|value|worth|gear|setup|bundle|package|products?)`, 'i').test(
    haystack,
  ) ||
  new RegExp(`\\b(?:worth|valued at|value of)\\b.{0,30}${moneyAmountPattern}`, 'i').test(haystack);
const hasDirectCashAmount = (haystack) =>
  !hasPrizeValueLanguage(haystack) &&
  new RegExp(`\\b(?:win|wins|winner|winners|get|gets|receive|earn|claim)\\b.{0,40}${moneyAmountPattern}`, 'i').test(
    haystack,
  );
const hasCashPayoutSignal = (haystack) =>
  hasDirectCashAmount(haystack) ||
  new RegExp(
    `\\b(?:cash|paypal|venmo|cashapp|bank transfer|direct deposit|wire transfer|payouts?|award money|prize money|reward money|usd prize)\\b.{0,40}${moneyAmountPattern}|${moneyAmountPattern}.{0,40}\\b(?:cash|paypal|venmo|cashapp|bank transfer|direct deposit|wire transfer|payouts?|award money|prize money|reward money|usd prize)\\b`,
    'i',
  ).test(haystack) ||
  includesAny(haystack, [
    'ach transfer',
    'award money',
    'bank transfer',
    'bounty',
    'cash',
    'cash prize',
    'cash reward',
    'cashapp',
    'crypto prize',
    'direct deposit',
    'financial prize',
    'grant prize',
    'microgrant',
    'monetary prize',
    'paypal',
    'payoneer',
    'payout',
    'payouts',
    'prize fund',
    'prize money',
    'prize pool',
    'reward money',
    'scholarship',
    'stipend',
    'usd prize',
    'venmo',
    'win money',
    'wire transfer',
  ]);
const hasTravelPrize = (haystack) =>
  /\b(win|wins|winner|winners|get|gets|prize|grand prize|chance to win).{0,90}\b(trips?|flights?|hotel stays?|vacations?|holidays?|getaways?|resorts?|cruises?|flyaways?)\b/i.test(
    haystack,
  ) ||
  /\b(trips?|flights?|hotel stays?|vacations?|holidays?|getaways?|resorts?|cruises?|flyaways?)\s+(to|in|for|with)\b/i.test(
    haystack,
  ) ||
  /\b(night stay|hotel stay|stay for two|luxury escape|dream trip|around the world cruise)\b/i.test(
    haystack,
  );
const hasLocalUseReward = (haystack) =>
  /\b(local businesses?|local partners?|local favourites?|barrie location|specific location|pickup only|in-store only|local pickup)\b/i.test(
    haystack,
  ) ||
  /\b(unlimited monthly pass|monthly pass|class pass|classes?|admission tickets?|water park passes?|venue passes?|passes to the)\b/i.test(
    haystack,
  );

export const rewardSubcategories = [
  'game',
  'dlc',
  'in_game_item',
  'gift_card',
  'hardware',
  'cash',
  'trip',
  'software',
  'other',
];
const rewardSubcategoryTagSet = new Set([
  ...rewardSubcategories,
  'games',
  'gift cards',
  'in-game',
  'trips',
]);

export function classifyRewardType(opportunity) {
  const rawTags = Array.isArray(opportunity?.tags) ? opportunity.tags : [];
  const tags = rawTags.filter((tag) => !rewardSubcategoryTagSet.has(lower(tag)));
  const raw = opportunity?.raw_data && typeof opportunity.raw_data === 'object' ? opportunity.raw_data : {};
  const source = lower(opportunity?.source);
  const sourceType = lower(opportunity?.source_type);
  const title = lower(opportunity?.title);
  const rawType = lower(raw.type ?? tags[0]);
  const sourceSpecificText = lower([opportunity?.title, opportunity?.summary, ...tags, raw.type].join(' '));

  if (['epicgames', 'cheapshark'].includes(source)) return 'game';

  if (source === 'gamerpower') {
    if (includesAny(title, ['extension', 'software', 'app', 'tool'])) return 'software';

    if (rawType.includes('game') || rawType.includes('early access')) {
      return 'game';
    }

    if (rawType.includes('dlc')) {
      if (
        includesAny(sourceSpecificText, [
          'skin',
          'outfit',
          'cloak',
          'weapon',
          'mount',
          'pet',
          'emblem',
          'currency',
          'coins',
          'gems',
          'primogems',
          'loot',
          'item',
          'gift pack',
          'starter pack',
          'bonus code',
          'invite code',
          'bundle',
        ])
      ) {
        return 'in_game_item';
      }

      return 'dlc';
    }
  }

  const haystack = lower(
    [
      opportunity?.title,
      opportunity?.clean_summary,
      opportunity?.prize_description,
      opportunity?.eligibility,
      opportunity?.summary,
      opportunity?.organization,
      opportunity?.source,
      ...tags,
      raw.type,
      raw.platforms,
      raw.worth,
      raw.instructions,
      raw.description,
      raw.title,
    ].join(' '),
  );

  if (!haystack) return 'other';

  const socialHardwareSources = [
    'alienware',
    'amd',
    'aorus_official',
    'asusrog',
    'astrogaming',
    'coolermaster',
    'corsair',
    'cyberpowerpc',
    'drop',
    'elgato',
    'gigabyte_official',
    'gskillgaming',
    'hyperx',
    'ibuypowerpc',
    'intelgaming',
    'logitechg',
    'maingear',
    'msigaming',
    'nvidiageforce',
    'nzxt',
    'originpc',
    'razer',
    'scufgaming',
    'secretlab',
    'steelseries',
    'thermaltakeusa',
    'turtlebeach',
    'zotacgaming',
  ];

  if (hasTravelPrize(haystack)) {
    if (
      includesAny(haystack, [
        'monitor',
        'keyboard',
        'mouse',
        'headset',
        'gpu',
        'gaming pc',
        'pc build',
        'setup',
      ])
    ) {
      return 'hardware';
    }

    return 'trip';
  }

  if (hasLocalUseReward(haystack)) {
    return 'other';
  }

  if (
    includesAny(haystack, [
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
    ])
  ) {
    return 'gift_card';
  }

  if (hasCashPayoutSignal(haystack) || (hasShortMoneyAmount(haystack) && !hasPrizeValueLanguage(haystack))) {
    return 'cash';
  }

  if (
    includesAny(haystack, [
      'trip',
      'travel',
      'flight',
      'hotel',
      'vacation',
      'holiday',
      'getaway',
      'resort',
    ])
  ) {
    if (
      includesAny(haystack, [
        'monitor',
        'keyboard',
        'mouse',
        'headset',
        'gpu',
        'gaming pc',
        'pc build',
        'setup',
      ])
    ) {
      return 'hardware';
    }

    return 'trip';
  }

  if (
    includesAny(haystack, [
      'keyboard',
      'mouse',
      'headset',
      'monitor',
      'gpu',
      'graphics card',
      'laptop',
      'pc build',
      'gaming pc',
      'gaming reasons',
      'hand-painted',
      'oled monitor',
      'rtx',
      'setup',
      'signed panel',
      'system',
      'ultra 5',
      'chair',
      'cooler',
      'controller',
      'wheel',
      'microphone',
      'camera',
      'car',
      'cars',
      'truck',
      'motorcycle',
      'motorbike',
      'bike',
      'bicycle',
      'vehicle',
      'appliance',
      'speaker',
      'speakers',
      'hardware',
      'maingear',
      'microcenter',
      'msi',
      'nvidia',
      'razer',
      'corsair',
      'logitech',
      'steelseries',
    ])
  ) {
    return 'hardware';
  }

  if (sourceType === 'social' && socialHardwareSources.includes(source)) {
    return 'hardware';
  }

  if (
    includesAny(haystack, [
      'subscription',
      'software',
      'license',
      'saas',
      'tool',
      'pro plan',
      'premium',
      'membership',
    ]) ||
    /\bapp\b/i.test(haystack)
  ) {
    return 'software';
  }

  if (
    includesAny(haystack, [
      'dlc',
      'add-on',
      'addon',
      'expansion',
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
    ])
  ) {
    if (
      includesAny(haystack, [
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
      ])
    ) {
      return 'in_game_item';
    }

    return 'dlc';
  }

  if (
    includesAny(haystack, [
      'game',
      'steam',
      'epic games',
      'gog',
      'itch.io',
      'drm-free',
      'playstation',
      'xbox',
      'nintendo',
      'pc',
      'vr',
    ])
  ) {
    return 'game';
  }

  return 'other';
}

export function rewardLabel(subcategory) {
  return {
    game: 'Games',
    dlc: 'DLC',
    in_game_item: 'In-game',
    gift_card: 'Gift cards',
    hardware: 'Hardware',
    cash: 'Cash',
    trip: 'Trips',
    software: 'Software',
    other: 'Other',
  }[subcategory] ?? 'Other';
}
