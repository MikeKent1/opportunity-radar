const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

const includesAny = (haystack, needles) => needles.some((needle) => haystack.includes(needle));
const hasMoneyAmount = (haystack) =>
  /(?:[$€£]\s?\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?|\b\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?\s?(?:usd|eur|gbp|dollars?|euros?|pounds?)\b)/i.test(
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

export function classifyRewardType(opportunity) {
  const tags = Array.isArray(opportunity?.tags) ? opportunity.tags : [];
  const raw = opportunity?.raw_data && typeof opportunity.raw_data === 'object' ? opportunity.raw_data : {};
  const source = lower(opportunity?.source);
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
      opportunity?.summary,
      opportunity?.organization,
      opportunity?.source,
      opportunity?.subcategory,
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

  if (
    hasMoneyAmount(haystack) ||
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
    ])
  ) {
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
      'chair',
      'controller',
      'wheel',
      'microphone',
      'camera',
      'hardware',
      'razer',
      'corsair',
      'logitech',
      'steelseries',
    ])
  ) {
    return 'hardware';
  }

  if (
    includesAny(haystack, [
      'subscription',
      'software',
      'license',
      'app',
      'saas',
      'tool',
      'pro plan',
      'premium',
      'membership',
    ])
  ) {
    return 'software';
  }

  if (
    includesAny(haystack, [
      'dlc',
      'add-on',
      'addon',
      'expansion',
      'pack',
      'bundle',
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
