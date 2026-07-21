import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  InteractionManager,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Session } from '@supabase/supabase-js';

import { OpportunityCard } from './src/components/OpportunityCard';
import { isSupabaseConfigured, supabase } from './src/lib/supabase';
import { signInWithGoogle, signOut } from './src/services/auth';
import { Opportunity, OpportunitySource } from './src/types';
import {
  hideOpportunity,
  loadCompetitionSubcategoryCounts,
  loadFreeToPlaySubcategoryCounts,
  loadGiveawaySubcategoryCounts,
  loadGrantSubcategoryCounts,
  loadHiddenOpportunityIds,
  loadLaunchSubcategoryCounts,
  loadOpportunityCounts,
  loadSavedOpportunityIds,
  loadTenderSubcategoryCounts,
  loadOpportunities,
  loadOpportunityDetail,
  loadOpportunityFeedVersion,
  saveOpportunity,
  subscribeToOpportunities,
  unhideOpportunity,
  unsaveOpportunity,
  type OpportunityFeedFilter,
  type OpportunityCounts,
} from './src/services/opportunities';
import { cleanDisplayText } from './src/utils/displayText';

const prizenAppIcon = require('./assets/prizen-icon.png');
const prizenMark = require('./assets/prizen-mark-transparent.png');
const OPPORTUNITY_PAGE_SIZE = 15;
const LOAD_MORE_FEEDBACK_MS = 650;
const SCROLL_TO_TOP_THRESHOLD = 220;
const COUNTRY_STORAGE_PREFIX = 'prizen.countryPreference';
const PROFILE_TYPE_STORAGE_PREFIX = 'prizen.profileTypePreference';
const localLimitingRiskFlags = new Set(['local_use_reward', 'region_limited']);
const strictHiddenEligibilityFlags = new Set(['invite_only', 'employees_only', 'members_only']);
const profileLimitedEligibilityFlags: Record<string, string[]> = {
  students_only: ['student'],
  nonprofits_only: ['nonprofit'],
  companies_only: ['company', 'startup'],
  government_only: ['government'],
  tribal_organizations_only: ['tribal_organization'],
  research_institutions_only: ['student', 'nonprofit'],
};
const euCountryCodes = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);
const countryOptions = [
  { code: 'WORLDWIDE', label: 'Worldwide / Any' },
  { code: 'GR', label: 'Greece' },
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'SE', label: 'Sweden' },
  { code: 'NO', label: 'Norway' },
  { code: 'FI', label: 'Finland' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'IE', label: 'Ireland' },
  { code: 'NZ', label: 'New Zealand' },
];
const profileTypeOptions = [
  { id: 'individual', label: 'Individual' },
  { id: 'student', label: 'Student' },
  { id: 'startup', label: 'Startup' },
  { id: 'nonprofit', label: 'Nonprofit' },
  { id: 'company', label: 'Company' },
  { id: 'government', label: 'Government' },
  { id: 'tribal_organization', label: 'Tribal organization' },
];
const legalLinks = [
  { label: 'Privacy Policy', url: 'https://prizen.app/privacy' },
  { label: 'Terms of Service', url: 'https://prizen.app/terms' },
  { label: 'Support', url: 'https://prizen.app/support' },
  { label: 'Delete account', url: 'https://prizen.app/delete-account' },
];

type Filter =
  | 'all'
  | 'saved'
  | 'hidden'
  | 'giveaways'
  | 'freetoplay'
  | 'launches'
  | 'competitions'
  | 'feeds'
  | 'community'
  | 'grants'
  | 'tenders';

type PreparedOpportunity = Opportunity & {
  isGiveaway: boolean;
  searchText: string;
  normalizedTags: string[];
};

type SecondaryFilter = {
  id: string;
  label: string;
};

const filters: { id: Filter; label: string }[] = [
  { id: 'giveaways', label: 'Giveaways' },
  { id: 'freetoplay', label: 'Free to Play' },
  { id: 'competitions', label: 'Competitions' },
  { id: 'grants', label: 'Grants' },
  { id: 'tenders', label: 'Tenders' },
  { id: 'launches', label: 'Launches' },
  { id: 'feeds', label: 'Feeds' },
  { id: 'community', label: 'Community' },
  { id: 'saved', label: 'Saved' },
  { id: 'hidden', label: 'Hidden' },
  { id: 'all', label: 'All' },
];

const initialFeedFilters: OpportunityFeedFilter[] = [
  'giveaways',
  'freetoplay',
  'competitions',
  'grants',
  'tenders',
  'launches',
  'feeds',
  'community',
];
function getRemoteFeedFilter(filter: Filter): OpportunityFeedFilter | null {
  if (filter === 'saved' || filter === 'hidden') return null;
  return filter;
}

function getPaginationKey(filter: Filter, secondaryFilter: string) {
  return (
    filter === 'giveaways' ||
    filter === 'freetoplay' ||
    filter === 'competitions' ||
    filter === 'grants' ||
    filter === 'tenders' ||
    filter === 'launches'
  ) && secondaryFilter !== 'all'
    ? `${filter}:${secondaryFilter}`
    : filter;
}

function mergeOpportunities(existing: Opportunity[], incoming: Opportunity[]) {
  const seen = new Set(existing.map((opportunity) => opportunity.id));
  const next = [...existing];

  for (const opportunity of incoming) {
    if (seen.has(opportunity.id)) continue;
    seen.add(opportunity.id);
    next.push(opportunity);
  }

  return next;
}

function prepareOpportunity(opportunity: Opportunity): PreparedOpportunity {
  return {
    ...opportunity,
    isGiveaway: isGiveawayOpportunity(opportunity),
    normalizedTags: opportunity.tags.map((tag) => tag.toLocaleLowerCase('en')),
    searchText:
      `${opportunity.title} ${opportunity.organization} ${opportunity.summary} ${opportunity.clean_summary ?? ''} ${opportunity.prize_description ?? ''} ${opportunity.eligibility ?? ''} ${(opportunity.eligible_countries ?? []).join(' ')} ${(opportunity.excluded_countries ?? []).join(' ')} ${(opportunity.eligible_regions ?? []).join(' ')} ${(opportunity.localities ?? []).join(' ')} ${(opportunity.audience_tags ?? []).join(' ')} ${(opportunity.eligibility_flags ?? []).join(' ')}`.toLocaleLowerCase(
        'en',
      ),
  };
}

const secondaryFilters: Partial<Record<Filter, SecondaryFilter[]>> = {
  giveaways: [
    { id: 'cash', label: 'Cash' },
    { id: 'trip', label: 'Trips' },
    { id: 'gift_card', label: 'Gift cards' },
    { id: 'hardware', label: 'Hardware' },
    { id: 'game', label: 'Games' },
    { id: 'software', label: 'Software' },
    { id: 'in_game_item', label: 'In-game' },
    { id: 'dlc', label: 'DLC' },
    { id: 'other', label: 'Other' },
    { id: 'all', label: 'All' },
  ],
  freetoplay: [
    { id: 'mmorpg', label: 'MMORPG' },
    { id: 'shooter', label: 'Shooter' },
    { id: 'strategy', label: 'Strategy' },
    { id: 'card', label: 'Card Games' },
    { id: 'moba', label: 'MOBA' },
    { id: 'battle_royale', label: 'Battle Royale' },
    { id: 'sports', label: 'Sports' },
    { id: 'browser', label: 'Browser' },
    { id: 'all', label: 'All' },
  ],
  competitions: [
    { id: 'cash_prize', label: 'Cash Prize' },
    { id: 'featured', label: 'Featured' },
    { id: 'getting_started', label: 'Getting Started' },
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'playground', label: 'Playground' },
    { id: 'swag', label: 'Swag' },
    { id: 'all', label: 'All' },
  ],
  grants: [
    { id: 'high_value', label: 'High Value' },
    { id: 'health', label: 'Health' },
    { id: 'social_services', label: 'Social Services' },
    { id: 'research', label: 'Research' },
    { id: 'education', label: 'Education' },
    { id: 'business', label: 'Business' },
    { id: 'environment', label: 'Environment' },
    { id: 'eu_grants', label: 'EU Grants' },
    { id: 'all', label: 'All' },
  ],
  tenders: [
    { id: 'high_value', label: 'High Value' },
    { id: 'closing_soon', label: 'Closing Soon' },
    { id: 'norway', label: 'Norway' },
    { id: 'sweden', label: 'Sweden' },
    { id: 'netherlands', label: 'Netherlands' },
    { id: 'finland', label: 'Finland' },
    { id: 'france', label: 'France' },
    { id: 'all', label: 'All' },
  ],
  launches: [
    { id: 'ai', label: 'AI' },
    { id: 'productivity', label: 'Productivity' },
    { id: 'developer_tools', label: 'Developer Tools' },
    { id: 'saas', label: 'SaaS' },
    { id: 'writing', label: 'Writing' },
    { id: 'games', label: 'Games' },
    { id: 'social', label: 'Social' },
    { id: 'all', label: 'All' },
  ],
};

const initialSecondaryFilters: Record<string, string> = {
  giveaways: 'cash',
  freetoplay: 'mmorpg',
  competitions: 'cash_prize',
  grants: 'high_value',
  tenders: 'high_value',
  launches: 'ai',
};

function isGiveawayOpportunity(opportunity: Opportunity) {
  return (
    opportunity.source_type === 'social' ||
    opportunity.category === 'giveaways' ||
    ['gamerpower', 'epicgames', 'cheapshark', 'kingsumo'].includes(opportunity.source)
  );
}

function formatDetailDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getOpportunityActionUrl(opportunity: Opportunity) {
  return opportunity.participation_url || opportunity.url;
}

function getRewardLabel(opportunity: Opportunity) {
  if (opportunity.subcategory) {
    return (
      {
        cash: 'Cash',
        dlc: 'DLC',
        game: 'Game',
        gift_card: 'Gift card',
        hardware: 'Hardware',
        in_game_item: 'In-game item',
        other: 'Other',
        software: 'Software',
        trip: 'Trip',
      }[opportunity.subcategory] ?? opportunity.subcategory.replace(/_/g, ' ')
    );
  }
  if (opportunity.amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: opportunity.currency,
      maximumFractionDigits: 0,
    }).format(opportunity.amount);
  }
  return opportunity.category ?? 'opportunity';
}

function getProfileName(session: Session) {
  const metadata = session.user.user_metadata;
  return (
    metadata.full_name ||
    metadata.name ||
    metadata.preferred_username ||
    session.user.email?.split('@')[0] ||
    'Prizen user'
  );
}

function getProfileAvatarUrl(session: Session) {
  const metadata = session.user.user_metadata;
  return metadata.avatar_url || metadata.picture || null;
}

function getProfileInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function getProfileProvider(session: Session) {
  return session.user.app_metadata.provider || session.user.identities?.[0]?.provider || 'google';
}

function getCountryLabel(countryCode: string | null) {
  return countryOptions.find((country) => country.code === countryCode)?.label ?? 'Not set';
}

function getProfileTypeLabel(profileType: string | null) {
  return profileTypeOptions.find((option) => option.id === profileType)?.label ?? 'Not set';
}

function countryStorageKey(userId: string) {
  return `${COUNTRY_STORAGE_PREFIX}:${userId}`;
}

function profileTypeStorageKey(userId: string) {
  return `${PROFILE_TYPE_STORAGE_PREFIX}:${userId}`;
}

function getDeadlineTimestamp(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function getQualityScore(opportunity: PreparedOpportunity) {
  const score = Number(opportunity.quality_score);
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.65;
}

function getRiskPenalty(opportunity: PreparedOpportunity) {
  const flags = Array.isArray(opportunity.risk_flags) ? opportunity.risk_flags : [];
  return flags.reduce((penalty, flag) => {
    if (localLimitingRiskFlags.has(flag)) return penalty + 0.7;
    if (flag === 'broken_text') return penalty + 0.4;
    if (flag === 'unclear_prize') return penalty + 0.3;
    if (flag === 'unclear_entry_path') return penalty + 0.2;
    if (flag === 'suspicious_claims' || flag === 'crypto_spam') return penalty + 0.6;
    if (flag === 'engagement_bait' || flag === 'misleading_value') return penalty + 0.25;
    return penalty + 0.1;
  }, 0);
}

function isLocallyLimitedOpportunity(opportunity: PreparedOpportunity) {
  const flags = Array.isArray(opportunity.risk_flags) ? opportunity.risk_flags : [];
  return flags.some((flag) => localLimitingRiskFlags.has(flag));
}

function hasCountryMismatch(opportunity: PreparedOpportunity, countryCode: string | null) {
  if (!countryCode || countryCode === 'WORLDWIDE') return false;
  const eligibleCountries = Array.isArray(opportunity.eligible_countries)
    ? opportunity.eligible_countries.map((country) => country.toUpperCase())
    : [];
  const excludedCountries = Array.isArray(opportunity.excluded_countries)
    ? opportunity.excluded_countries.map((country) => country.toUpperCase())
    : [];
  if (excludedCountries.includes(countryCode)) return true;
  if (eligibleCountries.length === 0 || eligibleCountries.includes('WORLDWIDE')) return false;
  return !eligibleCountries.includes(countryCode);
}

function hasRegionMismatch(opportunity: PreparedOpportunity, countryCode: string | null) {
  if (!countryCode || countryCode === 'WORLDWIDE') return false;
  const eligibleRegions = Array.isArray(opportunity.eligible_regions)
    ? opportunity.eligible_regions.map((region) => region.toUpperCase())
    : [];
  if (eligibleRegions.length === 0 || eligibleRegions.includes('WORLDWIDE')) return false;
  if (eligibleRegions.includes('EU') && euCountryCodes.has(countryCode)) return false;
  return true;
}

function hasAudienceMismatch(opportunity: PreparedOpportunity, profileType: string | null) {
  const audienceTags = Array.isArray(opportunity.audience_tags)
    ? opportunity.audience_tags.map((tag) => tag.toLowerCase())
    : [];
  if (audienceTags.length === 0 || audienceTags.includes('individual')) return false;
  if (!profileType) return false;
  return !audienceTags.includes(profileType);
}

function hasHardEligibilityMismatch(opportunity: PreparedOpportunity, profileType: string | null) {
  const flags = Array.isArray(opportunity.eligibility_flags) ? opportunity.eligibility_flags : [];
  if (flags.some((flag) => strictHiddenEligibilityFlags.has(flag))) return true;
  for (const [flag, allowedProfileTypes] of Object.entries(profileLimitedEligibilityFlags)) {
    if (flags.includes(flag) && (!profileType || !allowedProfileTypes.includes(profileType))) {
      return true;
    }
  }
  return false;
}

function shouldHideForLocation(
  opportunity: PreparedOpportunity,
  countryCode: string | null,
  profileType: string | null,
  hasQuery: boolean,
  filter: Filter,
) {
  if (hasQuery || filter === 'saved' || filter === 'hidden') return false;
  if (isLocallyLimitedOpportunity(opportunity)) return true;
  return (
    hasCountryMismatch(opportunity, countryCode) ||
    hasRegionMismatch(opportunity, countryCode) ||
    hasAudienceMismatch(opportunity, profileType) ||
    hasHardEligibilityMismatch(opportunity, profileType)
  );
}

function getOpportunityRankScore(opportunity: PreparedOpportunity) {
  const quality = getQualityScore(opportunity);
  const riskPenalty = getRiskPenalty(opportunity);
  const hasCleanSummary = opportunity.clean_summary ? 0.05 : 0;
  const hasPrize = opportunity.prize_description ? 0.05 : 0;
  const hasEligibility = opportunity.eligibility ? 0.03 : 0;

  return quality + hasCleanSummary + hasPrize + hasEligibility - riskPenalty;
}

function compareByQuality(left: PreparedOpportunity, right: PreparedOpportunity) {
  const rankDiff = getOpportunityRankScore(right) - getOpportunityRankScore(left);
  if (Math.abs(rankDiff) > 0.001) return rankDiff;

  const deadlineDiff = getDeadlineTimestamp(left.deadline) - getDeadlineTimestamp(right.deadline);
  if (deadlineDiff !== 0) return deadlineDiff;

  return getDeadlineTimestamp(right.published_at) - getDeadlineTimestamp(left.published_at);
}

function sortGiveawaysByQuality(opportunities: PreparedOpportunity[]) {
  return [...opportunities].sort(compareByQuality);
}

function sortCashGiveaways(opportunities: PreparedOpportunity[]) {
  return [...opportunities].sort((left, right) => {
    const leftAmount = left.amount ?? null;
    const rightAmount = right.amount ?? null;

    if (leftAmount !== null || rightAmount !== null) {
      if (leftAmount === null) return 1;
      if (rightAmount === null) return -1;
      if (rightAmount !== leftAmount) return rightAmount - leftAmount;
    }

    const qualityDiff = getOpportunityRankScore(right) - getOpportunityRankScore(left);
    if (Math.abs(qualityDiff) > 0.001) return qualityDiff;

    const deadlineDiff = getDeadlineTimestamp(left.deadline) - getDeadlineTimestamp(right.deadline);
    if (deadlineDiff !== 0) return deadlineDiff;

    return getDeadlineTimestamp(right.published_at) - getDeadlineTimestamp(left.published_at);
  });
}

function hasTag(opportunity: Opportunity, tag: string) {
  const normalizedTag = tag.toLocaleLowerCase('en');
  const tags =
    'normalizedTags' in opportunity
      ? (opportunity as PreparedOpportunity).normalizedTags
      : opportunity.tags.map((item) => item.toLocaleLowerCase('en'));
  return tags.some((item) => item === normalizedTag);
}

function hasTagIncluding(opportunity: Opportunity, value: string) {
  const normalizedValue = value.toLocaleLowerCase('en');
  const tags =
    'normalizedTags' in opportunity
      ? (opportunity as PreparedOpportunity).normalizedTags
      : opportunity.tags.map((item) => item.toLocaleLowerCase('en'));
  return tags.some((item) => item.includes(normalizedValue));
}

function isClosingSoon(opportunity: Opportunity, days = 30) {
  const timestamp = getDeadlineTimestamp(opportunity.deadline);
  if (!Number.isFinite(timestamp)) return false;
  const now = Date.now();
  return timestamp >= now && timestamp <= now + days * 86_400_000;
}

function hasStrongCashReward(opportunity: Opportunity) {
  const haystack = [
    opportunity.title,
    opportunity.clean_summary,
    opportunity.prize_description,
    opportunity.eligibility,
    opportunity.summary,
    opportunity.organization,
    opportunity.source,
    ...(opportunity.tags ?? []),
  ]
    .join(' ')
    .toLocaleLowerCase('en');
  const moneyAmount =
    /(?:[$\u20AC\u00A3]\s?\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?|[$\u20AC\u00A3]\s?\d+(?:\.\d+)?\s?k\b|\b(?:usd|eur|gbp)\s?\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?\b|\b\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?\s?(?:usd|eur|gbp|dollars?|euros?|pounds?)\b)/i;
  const directMoneyAmount = new RegExp(
    `\\b(?:win|wins|winner|winners|grand prize|prize|get|gets|receive|earn|claim|score)\\b.{0,45}${moneyAmount.source}|${moneyAmount.source}.{0,45}\\b(?:winner|winners|grand prize|prize)\\b`,
    'i',
  ).test(haystack);
  const explicitCashPayout =
    /\b(?:win|wins|winner|winners|get|gets|receive|earn|claim|score).{0,45}\b(?:cash|money|paypal|venmo|cashapp|payout|payouts|prize money|award money|reward money)\b/i.test(
      haystack,
    ) ||
    /\b(?:cash prizes?|cash rewards?|cash payout|paypal|venmo|cashapp|bank transfer|direct deposit|wire transfer|prepaid mastercard rewards?|prize money|award money|reward money|scholarship|stipend|usd prize)\b/i.test(
      haystack,
    );
  const productOrLocalSignal =
    /\b(?:setup|hardware|football tackle dummy|watercraft|vehicle|trip|travel package|hotel stay|flight|vacation|local pickup|in-store only|class pass|admission tickets?)\b/i.test(
      haystack,
    );

  return (
    (opportunity.subcategory ?? 'other') === 'cash' &&
    (explicitCashPayout || directMoneyAmount) &&
    (explicitCashPayout || !productOrLocalSignal)
  );
}

function matchesSecondaryFilter(
  opportunity: PreparedOpportunity,
  filter: Filter,
  secondaryFilter: string,
) {
  if (secondaryFilter === 'all') return true;

  if (filter === 'giveaways') {
    if (secondaryFilter === 'cash') return hasStrongCashReward(opportunity);
    return (opportunity.subcategory ?? 'other') === secondaryFilter;
  }

  if (filter === 'freetoplay') {
    if (secondaryFilter === 'mmorpg') return hasTag(opportunity, 'MMORPG');
    if (secondaryFilter === 'shooter') return hasTag(opportunity, 'Shooter');
    if (secondaryFilter === 'strategy') return hasTag(opportunity, 'Strategy');
    if (secondaryFilter === 'card') return hasTag(opportunity, 'Card Game');
    if (secondaryFilter === 'moba') return hasTag(opportunity, 'MOBA');
    if (secondaryFilter === 'battle_royale') return hasTag(opportunity, 'Battle Royale');
    if (secondaryFilter === 'sports') return hasTag(opportunity, 'Sports');
    if (secondaryFilter === 'browser') return hasTagIncluding(opportunity, 'Web Browser');
  }

  if (filter === 'competitions') {
    if (secondaryFilter === 'cash_prize') return Boolean(opportunity.amount && opportunity.amount > 0);
    if (secondaryFilter === 'featured') return hasTag(opportunity, 'Featured');
    if (secondaryFilter === 'getting_started') return hasTag(opportunity, 'Getting Started');
    if (secondaryFilter === 'knowledge') return hasTag(opportunity, 'Knowledge');
    if (secondaryFilter === 'playground') return hasTag(opportunity, 'Playground');
    if (secondaryFilter === 'swag') return hasTag(opportunity, 'Swag');
  }

  if (filter === 'grants') {
    if (secondaryFilter === 'high_value') return Boolean(opportunity.amount && opportunity.amount >= 500_000);
    if (secondaryFilter === 'health') return hasTag(opportunity, 'Health');
    if (secondaryFilter === 'social_services') {
      return hasTag(opportunity, 'Income Security And Social Services');
    }
    if (secondaryFilter === 'research') {
      return hasTag(opportunity, 'Science Technology And Other Research And Development');
    }
    if (secondaryFilter === 'education') return hasTag(opportunity, 'Education');
    if (secondaryFilter === 'business') return hasTag(opportunity, 'Business And Commerce');
    if (secondaryFilter === 'environment') return hasTag(opportunity, 'Environment');
    if (secondaryFilter === 'eu_grants') return opportunity.source === 'eufunding';
  }

  if (filter === 'tenders') {
    if (secondaryFilter === 'high_value') return Boolean(opportunity.amount && opportunity.amount >= 10_000_000);
    if (secondaryFilter === 'closing_soon') return isClosingSoon(opportunity);
    if (secondaryFilter === 'norway') return hasTag(opportunity, 'NOR');
    if (secondaryFilter === 'sweden') return hasTag(opportunity, 'SWE');
    if (secondaryFilter === 'netherlands') return hasTag(opportunity, 'NLD');
    if (secondaryFilter === 'finland') return hasTag(opportunity, 'FIN');
    if (secondaryFilter === 'france') return hasTag(opportunity, 'FRA');
  }

  if (filter === 'launches') {
    if (secondaryFilter === 'ai') return hasTag(opportunity, 'Artificial Intelligence');
    if (secondaryFilter === 'productivity') return hasTag(opportunity, 'Productivity');
    if (secondaryFilter === 'developer_tools') return hasTag(opportunity, 'Developer Tools');
    if (secondaryFilter === 'saas') return hasTag(opportunity, 'SaaS');
    if (secondaryFilter === 'writing') return hasTag(opportunity, 'Writing');
    if (secondaryFilter === 'games') return hasTag(opportunity, 'Games');
    if (secondaryFilter === 'social') return hasTag(opportunity, 'Social Media');
  }

  return true;
}

export default function App() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [filter, setFilter] = useState<Filter>('giveaways');
  const [activeSecondaryFilters, setActiveSecondaryFilters] =
    useState<Record<string, string>>(initialSecondaryFilters);
  const [query, setQuery] = useState('');
  const activeSecondaryFilter = activeSecondaryFilters[filter] ?? 'all';
  const [appliedFilter, setAppliedFilter] = useState<Filter>('giveaways');
  const [appliedSecondaryFilter, setAppliedSecondaryFilter] = useState(
    initialSecondaryFilters.giveaways,
  );
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remoteCounts, setRemoteCounts] = useState<OpportunityCounts | null>(null);
  const [remoteSecondaryFilterCounts, setRemoteSecondaryFilterCounts] = useState<
    Partial<Record<Filter, Record<string, number>>>
  >({});
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [savedOpportunityIds, setSavedOpportunityIds] = useState<Set<string>>(new Set());
  const [savingOpportunityIds, setSavingOpportunityIds] = useState<Set<string>>(new Set());
  const [hiddenOpportunityIds, setHiddenOpportunityIds] = useState<Set<string>>(new Set());
  const [hidingOpportunityIds, setHidingOpportunityIds] = useState<Set<string>>(new Set());
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [profileVisible, setProfileVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countryPreference, setCountryPreference] = useState<string | null>(null);
  const [countryPreferenceLoaded, setCountryPreferenceLoaded] = useState(false);
  const [profileTypePickerVisible, setProfileTypePickerVisible] = useState(false);
  const [profileTypePreference, setProfileTypePreference] = useState<string | null>(null);
  const [profileTypePreferenceLoaded, setProfileTypePreferenceLoaded] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(OPPORTUNITY_PAGE_SIZE);
  const [feedOffsets, setFeedOffsets] = useState<Record<string, number>>({});
  const [feedHasMore, setFeedHasMore] = useState<Record<string, boolean>>({});
  const [loadingMoreKeys, setLoadingMoreKeys] = useState<Set<string>>(new Set());
  const [loadMoreFeedbackKey, setLoadMoreFeedbackKey] = useState<string | null>(null);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const listRef = useRef<FlatList<PreparedOpportunity>>(null);
  const latestFeedVersionRef = useRef<string | null>(null);
  const feedRequestIdRef = useRef(0);
  const showScrollTopButtonRef = useRef(false);
  const detailCacheRef = useRef<Map<string, Partial<Opportunity>>>(new Map());

  const fetchOpportunityCounts = useCallback(async () => {
    const result = await loadOpportunityCounts({
      countryCode: countryPreference,
      profileType: profileTypePreference,
    });
    if (result.error) {
      console.warn('Supabase opportunity counts query failed:', result.error);
      return;
    }
    setRemoteCounts(result.data);
  }, [countryPreference, profileTypePreference]);

  const fetchSecondaryFilterCounts = useCallback(async () => {
    const [
      giveawayResult,
      freeToPlayResult,
      competitionResult,
      grantResult,
      tenderResult,
      launchResult,
    ] =
      await Promise.all([
      loadGiveawaySubcategoryCounts({
        countryCode: countryPreference,
        profileType: profileTypePreference,
      }),
      loadFreeToPlaySubcategoryCounts({
        countryCode: countryPreference,
        profileType: profileTypePreference,
      }),
      loadCompetitionSubcategoryCounts({
        countryCode: countryPreference,
        profileType: profileTypePreference,
      }),
      loadGrantSubcategoryCounts({
        countryCode: countryPreference,
        profileType: profileTypePreference,
      }),
      loadTenderSubcategoryCounts({
        countryCode: countryPreference,
        profileType: profileTypePreference,
      }),
      loadLaunchSubcategoryCounts({
        countryCode: countryPreference,
        profileType: profileTypePreference,
      }),
    ]);
    if (giveawayResult.error) {
      console.warn('Supabase giveaway subcategory counts query failed:', giveawayResult.error);
    }
    if (freeToPlayResult.error) {
      console.warn('Supabase free to play subcategory counts query failed:', freeToPlayResult.error);
    }
    if (competitionResult.error) {
      console.warn('Supabase competition subcategory counts query failed:', competitionResult.error);
    }
    if (grantResult.error) {
      console.warn('Supabase grant subcategory counts query failed:', grantResult.error);
    }
    if (tenderResult.error) {
      console.warn('Supabase tender subcategory counts query failed:', tenderResult.error);
    }
    if (launchResult.error) {
      console.warn('Supabase launch subcategory counts query failed:', launchResult.error);
    }
    setRemoteSecondaryFilterCounts((current) => ({
      ...current,
      giveaways: giveawayResult.error ? current.giveaways : giveawayResult.data,
      freetoplay: freeToPlayResult.error ? current.freetoplay : freeToPlayResult.data,
      competitions: competitionResult.error ? current.competitions : competitionResult.data,
      grants: grantResult.error ? current.grants : grantResult.data,
      tenders: tenderResult.error ? current.tenders : tenderResult.data,
      launches: launchResult.error ? current.launches : launchResult.data,
    }));
  }, [countryPreference, profileTypePreference]);

  const fetchOpportunities = useCallback(async (silent = false) => {
    const requestId = feedRequestIdRef.current + 1;
    feedRequestIdRef.current = requestId;
    if (!silent) setLoading(true);

    const feedRequests = [
      ...initialFeedFilters.map((filterId) => ({
        key: filterId,
        filter: filterId,
        subcategory: undefined,
      })),
      {
        key: getPaginationKey('giveaways', initialSecondaryFilters.giveaways),
        filter: 'giveaways' as OpportunityFeedFilter,
        subcategory: initialSecondaryFilters.giveaways,
      },
    ];
    const results = await Promise.all(
      feedRequests.map(async (request) => ({
        ...request,
        result: await loadOpportunities({
          filter: request.filter,
          subcategory: request.subcategory,
          limit: OPPORTUNITY_PAGE_SIZE,
          countryCode: countryPreference,
          profileType: profileTypePreference,
        }),
      })),
    );
    if (feedRequestIdRef.current !== requestId) return;

    let mergedOpportunities: Opportunity[] = [];
    const nextOffsets: Record<string, number> = {};
    const nextHasMore: Record<string, boolean> = {};
    let nextFeedVersion: string | null = null;
    let nextNotice: string | null = null;

    for (const { key, result } of results) {
      mergedOpportunities = mergeOpportunities(mergedOpportunities, result.data);
      nextOffsets[key] = result.data.length;
      nextHasMore[key] = result.data.length === OPPORTUNITY_PAGE_SIZE;
      nextFeedVersion = nextFeedVersion ?? result.feedVersion;
      nextNotice = nextNotice ?? result.notice;
    }

    latestFeedVersionRef.current = nextFeedVersion;
    setOpportunities(mergedOpportunities);
    setFeedOffsets(nextOffsets);
    setFeedHasMore(nextHasMore);
    setLoadingMoreKeys(new Set());
    setNotice(nextNotice);
    setLoading(false);
    setRefreshing(false);
  }, [countryPreference, profileTypePreference]);

  const fetchSavedOpportunities = useCallback(async () => {
    if (!session) {
      setSavedOpportunityIds(new Set());
      return;
    }

    const result = await loadSavedOpportunityIds();
    if (result.error) {
      console.warn('Supabase saved opportunities query failed:', result.error);
      return;
    }

    setSavedOpportunityIds(result.data);
  }, [session]);

  const fetchHiddenOpportunities = useCallback(async () => {
    if (!session) {
      setHiddenOpportunityIds(new Set());
      return;
    }

    const result = await loadHiddenOpportunityIds();
    if (result.error) {
      console.warn('Supabase hidden opportunities query failed:', result.error);
      return;
    }

    setHiddenOpportunityIds(result.data);
  }, [session]);

  const handleSelectOpportunity = useCallback((opportunity: Opportunity) => {
    const cachedDetail = detailCacheRef.current.get(opportunity.id);
    setSelectedOpportunity(cachedDetail ? { ...opportunity, ...cachedDetail } : opportunity);
    if (cachedDetail) return;

    InteractionManager.runAfterInteractions(() => {
      void loadOpportunityDetail(opportunity.id).then((result) => {
        if (result.error || !result.data) {
          if (result.error) console.warn('Supabase opportunity detail query failed:', result.error);
          return;
        }
        detailCacheRef.current.set(opportunity.id, result.data);
        setSelectedOpportunity((current) =>
          current?.id === opportunity.id ? { ...current, ...result.data } : current,
        );
      });
    });
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      const [versionResult] = await Promise.all([
        loadOpportunityFeedVersion(),
        fetchSavedOpportunities(),
        fetchHiddenOpportunities(),
        fetchOpportunityCounts(),
        fetchSecondaryFilterCounts(),
      ]);
      if (
        !versionResult.error &&
        versionResult.data &&
        latestFeedVersionRef.current === versionResult.data &&
        opportunities.length > 0
      ) {
        setRefreshing(false);
        return;
      }
      setRefreshing(false);
      await fetchOpportunities(true);
    })().finally(() => {
      setRefreshing(false);
    });
  }, [
    fetchHiddenOpportunities,
    fetchOpportunities,
    fetchOpportunityCounts,
    fetchSecondaryFilterCounts,
    fetchSavedOpportunities,
    opportunities.length,
  ]);

  useEffect(() => {
    void fetchOpportunities();
    void fetchOpportunityCounts();
    void fetchSecondaryFilterCounts();
    const unsubscribe = subscribeToOpportunities(() => {
      void fetchOpportunities(true);
      void fetchOpportunityCounts();
      void fetchSecondaryFilterCounts();
    });
    return unsubscribe;
  }, [fetchOpportunities, fetchOpportunityCounts, fetchSecondaryFilterCounts]);

  useEffect(() => {
    void fetchSavedOpportunities();
  }, [fetchSavedOpportunities]);

  useEffect(() => {
    void fetchHiddenOpportunities();
  }, [fetchHiddenOpportunities]);

  useEffect(() => {
    let cancelled = false;

    if (!session) {
      setCountryPreference(null);
      setCountryPreferenceLoaded(true);
      setCountryPickerVisible(false);
      setProfileTypePreference(null);
      setProfileTypePreferenceLoaded(true);
      setProfileTypePickerVisible(false);
      return () => {
        cancelled = true;
      };
    }

    setCountryPreferenceLoaded(false);
    setProfileTypePreferenceLoaded(false);
    void Promise.all([
      AsyncStorage.getItem(countryStorageKey(session.user.id)),
      AsyncStorage.getItem(profileTypeStorageKey(session.user.id)),
    ]).then(([storedCountry, storedProfileType]) => {
      if (cancelled) return;
      const validCountry = countryOptions.some((country) => country.code === storedCountry)
        ? storedCountry
        : null;
      const validProfileType = profileTypeOptions.some((option) => option.id === storedProfileType)
        ? storedProfileType
        : null;
      setCountryPreference(validCountry);
      setProfileTypePreference(validProfileType);
      setCountryPreferenceLoaded(true);
      setProfileTypePreferenceLoaded(true);
      setCountryPickerVisible(!validCountry);
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    const result = await signInWithGoogle();
    setAuthLoading(false);

    if (!result.ok && result.message !== 'Sign in was cancelled.') {
      Alert.alert('Sign in failed', result.message);
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    const result = await signOut();
    setAuthLoading(false);

    if (!result.ok) {
      Alert.alert('Sign out failed', result.message);
    } else {
      setProfileVisible(false);
    }
  };

  const handleToggleSave = useCallback(
    async (opportunityId: string) => {
      if (!session || savingOpportunityIds.has(opportunityId)) return;

      const wasSaved = savedOpportunityIds.has(opportunityId);
      setSavingOpportunityIds((current) => new Set(current).add(opportunityId));
      setSavedOpportunityIds((current) => {
        const next = new Set(current);
        if (wasSaved) {
          next.delete(opportunityId);
        } else {
          next.add(opportunityId);
        }
        return next;
      });

      const result = wasSaved
        ? await unsaveOpportunity(opportunityId)
        : await saveOpportunity(opportunityId);

      setSavingOpportunityIds((current) => {
        const next = new Set(current);
        next.delete(opportunityId);
        return next;
      });

      if (!result.ok) {
        setSavedOpportunityIds((current) => {
          const next = new Set(current);
          if (wasSaved) {
            next.add(opportunityId);
          } else {
            next.delete(opportunityId);
          }
          return next;
        });
        Alert.alert('Saved update failed', result.message);
      }
    },
    [savedOpportunityIds, savingOpportunityIds, session],
  );

  const handleToggleHide = useCallback(
    async (opportunityId: string) => {
      if (!session || hidingOpportunityIds.has(opportunityId)) return;

      const wasHidden = hiddenOpportunityIds.has(opportunityId);
      setHidingOpportunityIds((current) => new Set(current).add(opportunityId));
      setHiddenOpportunityIds((current) => {
        const next = new Set(current);
        if (wasHidden) {
          next.delete(opportunityId);
        } else {
          next.add(opportunityId);
        }
        return next;
      });

      const result = wasHidden
        ? await unhideOpportunity(opportunityId)
        : await hideOpportunity(opportunityId);

      setHidingOpportunityIds((current) => {
        const next = new Set(current);
        next.delete(opportunityId);
        return next;
      });

      if (!result.ok) {
        setHiddenOpportunityIds((current) => {
          const next = new Set(current);
          if (wasHidden) {
            next.add(opportunityId);
          } else {
            next.delete(opportunityId);
          }
          return next;
        });
        Alert.alert('Hidden update failed', result.message);
        return;
      }

      setSelectedOpportunity(null);
      void fetchOpportunityCounts();
      void fetchSecondaryFilterCounts();
    },
    [
      fetchOpportunityCounts,
      fetchSecondaryFilterCounts,
      hiddenOpportunityIds,
      hidingOpportunityIds,
      session,
    ],
  );

  const handleOpenOpportunity = useCallback((opportunity: Opportunity) => {
    void Linking.openURL(getOpportunityActionUrl(opportunity)).catch(() => {
      Alert.alert('Could not open link', 'Please try again in a moment.');
    });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const shouldShow = event.nativeEvent.contentOffset.y > SCROLL_TO_TOP_THRESHOLD;
    if (showScrollTopButtonRef.current === shouldShow) return;
    showScrollTopButtonRef.current = shouldShow;
    setShowScrollTopButton(shouldShow);
  }, []);

  const handleScrollToTop = useCallback(() => {
    showScrollTopButtonRef.current = false;
    setShowScrollTopButton(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);
  const handleOpenUrl = useCallback((url: string) => {
    void Linking.openURL(url).catch(() => {
      Alert.alert('Could not open link', 'Please try again in a moment.');
    });
  }, []);

  const handleSelectCountry = useCallback(
    async (countryCode: string) => {
      if (!session) return;
      setCountryPreference(countryCode);
      setCountryPickerVisible(false);
      await AsyncStorage.setItem(countryStorageKey(session.user.id), countryCode);
    },
    [session],
  );

  const handleSelectProfileType = useCallback(
    async (profileType: string) => {
      if (!session) return;
      setProfileTypePreference(profileType);
      setProfileTypePickerVisible(false);
      await AsyncStorage.setItem(profileTypeStorageKey(session.user.id), profileType);
    },
    [session],
  );

  const preparedOpportunities = useMemo<PreparedOpportunity[]>(
    () => opportunities.map(prepareOpportunity),
    [opportunities],
  );

  const opportunityBuckets = useMemo<Record<Filter, PreparedOpportunity[]>>(() => {
    const buckets: Record<Filter, PreparedOpportunity[]> = {
      all: [],
      saved: [],
      hidden: [],
      giveaways: [],
      freetoplay: [],
      launches: [],
      competitions: [],
      feeds: [],
      community: [],
      grants: [],
      tenders: [],
    };

    for (const opportunity of preparedOpportunities) {
      buckets.all.push(opportunity);
      if (savedOpportunityIds.has(opportunity.id)) buckets.saved.push(opportunity);
      if (hiddenOpportunityIds.has(opportunity.id)) buckets.hidden.push(opportunity);
      if (opportunity.isGiveaway) buckets.giveaways.push(opportunity);
      if (opportunity.source === 'freetogame') buckets.freetoplay.push(opportunity);
      if (opportunity.source === 'producthunt') buckets.launches.push(opportunity);
      if (opportunity.source === 'kaggle') buckets.competitions.push(opportunity);
      if (opportunity.source === 'rss') buckets.feeds.push(opportunity);
      if (opportunity.source === 'reddit') buckets.community.push(opportunity);
      if (opportunity.source === 'grants' || opportunity.source === 'eufunding') {
        buckets.grants.push(opportunity);
      }
      if (opportunity.source === 'ted') buckets.tenders.push(opportunity);
    }

    return buckets;
  }, [hiddenOpportunityIds, preparedOpportunities, savedOpportunityIds]);

  const filterCounts = useMemo<Record<Filter, number>>(() => {
    const countVisible = (filterId: Filter) =>
      opportunityBuckets[filterId].filter(
        (opportunity) =>
          (filterId === 'saved' ||
            filterId === 'hidden' ||
            !hiddenOpportunityIds.has(opportunity.id)) &&
          !shouldHideForLocation(
            opportunity,
            countryPreference,
            profileTypePreference,
            false,
            filterId,
          ),
      ).length;

    return {
      all: countVisible('all'),
      saved: savedOpportunityIds.size,
      hidden: countVisible('hidden'),
      giveaways: countVisible('giveaways'),
      freetoplay: countVisible('freetoplay'),
      launches: countVisible('launches'),
      competitions: countVisible('competitions'),
      feeds: countVisible('feeds'),
      community: countVisible('community'),
      grants: countVisible('grants'),
      tenders: countVisible('tenders'),
    };
  }, [
    countryPreference,
    hiddenOpportunityIds,
    hiddenOpportunityIds.size,
    opportunityBuckets,
    profileTypePreference,
    savedOpportunityIds.size,
  ]);

  const displayFilterCounts = useMemo<Record<Filter, number>>(
    () => ({
      ...filterCounts,
      all: remoteCounts?.all ?? filterCounts.all,
      giveaways: remoteCounts?.giveaways ?? filterCounts.giveaways,
      freetoplay: remoteCounts?.freetoplay ?? filterCounts.freetoplay,
      launches: remoteCounts?.launches ?? filterCounts.launches,
      competitions: remoteCounts?.competitions ?? filterCounts.competitions,
      feeds: remoteCounts?.feeds ?? filterCounts.feeds,
      community: remoteCounts?.community ?? filterCounts.community,
      grants: remoteCounts?.grants ?? filterCounts.grants,
      tenders: remoteCounts?.tenders ?? filterCounts.tenders,
      saved: savedOpportunityIds.size,
      hidden: filterCounts.hidden,
    }),
    [filterCounts, remoteCounts, savedOpportunityIds.size],
  );

  const secondaryFilterCounts = useMemo<Partial<Record<Filter, Record<string, number>>>>(() => {
    const counts: Partial<Record<Filter, Record<string, number>>> = {};

    for (const [filterId, items] of Object.entries(secondaryFilters) as [
      Filter,
      SecondaryFilter[],
    ][]) {
      const eligibleOpportunities = opportunityBuckets[filterId].filter(
        (opportunity) =>
          !hiddenOpportunityIds.has(opportunity.id) &&
          !shouldHideForLocation(
            opportunity,
            countryPreference,
            profileTypePreference,
            false,
            filterId,
          ),
      );
      counts[filterId] = Object.fromEntries(
        items.map((item) => [
          item.id,
          eligibleOpportunities.filter((opportunity) =>
            matchesSecondaryFilter(opportunity, filterId, item.id),
          ).length,
        ]),
      );
      if (remoteSecondaryFilterCounts[filterId]) {
        counts[filterId] = {
          ...counts[filterId],
          ...remoteSecondaryFilterCounts[filterId],
        };
      }
    }

    return counts;
  }, [
    countryPreference,
    hiddenOpportunityIds,
    opportunityBuckets,
    profileTypePreference,
    remoteSecondaryFilterCounts,
  ]);

  const visibleFilters = useMemo(() => {
    if (loading && opportunities.length === 0) return filters.filter((item) => item.id !== 'hidden');
    return filters.filter((item) => displayFilterCounts[item.id] > 0);
  }, [displayFilterCounts, loading, opportunities.length]);

  const visibleSecondaryFilters = useMemo(() => {
    const items = secondaryFilters[filter];
    if (!items) return undefined;
    const counts = secondaryFilterCounts[filter] ?? {};
    return items.filter((item) => (counts[item.id] ?? 0) > 0);
  }, [filter, secondaryFilterCounts]);

  const firstVisibleSecondaryFilter = useCallback(
    (filterId: Filter) => {
      const items = secondaryFilters[filterId];
      if (!items) return 'all';
      const counts = secondaryFilterCounts[filterId] ?? {};
      return items.find((item) => (counts[item.id] ?? 0) > 0)?.id ?? 'all';
    },
    [secondaryFilterCounts],
  );

  useEffect(() => {
    const remoteFilter = getRemoteFeedFilter(filter);
    if (!remoteFilter) return;

    const paginationKey = getPaginationKey(filter, activeSecondaryFilter);
    if (feedOffsets[paginationKey] !== undefined) return;
    if ((secondaryFilterCounts[filter]?.[activeSecondaryFilter] ?? 0) <= 0) return;
    if (loadingMoreKeys.has(paginationKey)) return;

    const subcategory =
      secondaryFilters[filter] && activeSecondaryFilter !== 'all'
        ? activeSecondaryFilter
        : undefined;

    setLoadingMoreKeys((current) => new Set(current).add(paginationKey));
    void loadOpportunities({
      filter: remoteFilter,
      subcategory,
      limit: OPPORTUNITY_PAGE_SIZE,
      countryCode: countryPreference,
      profileType: profileTypePreference,
    })
      .then((result) => {
        setOpportunities((current) => mergeOpportunities(current, result.data));
        setFeedOffsets((current) => ({
          ...current,
          [paginationKey]: result.data.length,
        }));
        setFeedHasMore((current) => ({
          ...current,
          [paginationKey]: result.data.length === OPPORTUNITY_PAGE_SIZE,
        }));
      })
      .finally(() => {
        setLoadingMoreKeys((current) => {
          const next = new Set(current);
          next.delete(paginationKey);
          return next;
        });
      });
  }, [
    activeSecondaryFilter,
    countryPreference,
    feedOffsets,
    filter,
    loadingMoreKeys,
    profileTypePreference,
    secondaryFilterCounts,
  ]);

  useEffect(() => {
    if (loading && opportunities.length === 0) return;
    if (visibleFilters.length === 0) return;
    if (displayFilterCounts[filter] > 0) return;

    const nextFilter = visibleFilters[0].id;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setVisibleLimit(OPPORTUNITY_PAGE_SIZE);
    setFilter(nextFilter);
    setActiveSecondaryFilters((current) => ({
      ...current,
      [nextFilter]: firstVisibleSecondaryFilter(nextFilter),
    }));
  }, [
    filter,
    displayFilterCounts,
    firstVisibleSecondaryFilter,
    loading,
    opportunities.length,
    visibleFilters,
  ]);

  useEffect(() => {
    if (!secondaryFilters[filter]) return;
    if (!visibleSecondaryFilters?.length) return;
    if (visibleSecondaryFilters.some((item) => item.id === activeSecondaryFilter)) return;

    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setVisibleLimit(OPPORTUNITY_PAGE_SIZE);
    setActiveSecondaryFilters((current) => ({
      ...current,
      [filter]: visibleSecondaryFilters[0].id,
    }));
  }, [activeSecondaryFilter, filter, visibleSecondaryFilters]);

  const profileName = session ? getProfileName(session) : '';
  const profileAvatarUrl = session ? getProfileAvatarUrl(session) : null;
  const profileProvider = session ? getProfileProvider(session) : 'google';
  const profileInitials = getProfileInitials(profileName);

  const activeFilterLabel = filters.find((item) => item.id === filter)?.label ?? 'Opportunities';
  const hasQuery = query.trim().length > 0;
  const sectionTitle =
    filter === 'saved'
      ? 'Saved opportunities'
      : filter === 'hidden'
        ? 'Hidden opportunities'
        : 'Latest opportunities';
  const emptyTitle =
    filter === 'saved'
      ? 'No saved opportunities yet'
      : filter === 'hidden'
        ? 'No hidden opportunities'
      : hasQuery
        ? 'No matches found'
        : `${activeFilterLabel} is empty`;
  const emptyMessage =
    filter === 'saved'
      ? 'Tap the star on any opportunity to keep it here.'
      : filter === 'hidden'
        ? 'Hidden opportunities will appear here.'
      : hasQuery
        ? 'Try a shorter search or switch filters.'
        : 'Pull to refresh or switch to another tab.';

  useEffect(() => {
    setVisibleLimit(OPPORTUNITY_PAGE_SIZE);
  }, [filter, activeSecondaryFilter, deferredQuery]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const frameId = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setAppliedFilter(filter);
        setAppliedSecondaryFilter(activeSecondaryFilter);
      }, 0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [filter, activeSecondaryFilter]);

  const visibleOpportunities = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase('en');
    const sourceOpportunities = opportunityBuckets[appliedFilter];
    const hasNormalizedQuery = normalizedQuery.length > 0;

    const filtered = sourceOpportunities.filter((opportunity) => {
      const matchesSecondary =
        !secondaryFilters[appliedFilter] ||
        matchesSecondaryFilter(opportunity, appliedFilter, appliedSecondaryFilter);
      const shouldHideByUser =
        appliedFilter !== 'saved' &&
        appliedFilter !== 'hidden' &&
        hiddenOpportunityIds.has(opportunity.id);
      const shouldHideLocalLimited =
        shouldHideForLocation(
          opportunity,
          countryPreference,
          profileTypePreference,
          hasNormalizedQuery,
          appliedFilter,
        );
      return (
        matchesSecondary &&
        !shouldHideByUser &&
        !shouldHideLocalLimited &&
        (!hasNormalizedQuery || opportunity.searchText.includes(normalizedQuery))
      );
    });

    if (appliedFilter === 'giveaways' && appliedSecondaryFilter === 'cash') {
      return sortCashGiveaways(filtered);
    }

    if (appliedFilter === 'giveaways') {
      return sortGiveawaysByQuality(filtered);
    }

    return filtered;
  }, [
    appliedFilter,
    appliedSecondaryFilter,
    countryPreference,
    deferredQuery,
    hiddenOpportunityIds,
    opportunityBuckets,
    profileTypePreference,
  ]);
  const isSwitchingOpportunities =
    appliedFilter !== filter || appliedSecondaryFilter !== activeSecondaryFilter;
  const selectedPaginationKey = getPaginationKey(filter, activeSecondaryFilter);
  const isLoadingSelectedFeed = loadingMoreKeys.has(selectedPaginationKey);
  const pagedOpportunities = useMemo(
    () => visibleOpportunities.slice(0, visibleLimit),
    [visibleLimit, visibleOpportunities],
  );
  const activePaginationKey = getPaginationKey(appliedFilter, appliedSecondaryFilter);
  const activeRemoteFilter = getRemoteFeedFilter(appliedFilter);
  const activeTotalCount =
    secondaryFilters[appliedFilter] && appliedSecondaryFilter
      ? secondaryFilterCounts[appliedFilter]?.[appliedSecondaryFilter] ?? visibleOpportunities.length
      : displayFilterCounts[appliedFilter] ?? visibleOpportunities.length;
  const hasMoreLocalOpportunities = pagedOpportunities.length < visibleOpportunities.length;
  const canLoadMoreRemote =
    !hasQuery &&
    Boolean(activeRemoteFilter) &&
    visibleOpportunities.length < activeTotalCount &&
    Boolean(feedHasMore[activePaginationKey]) &&
    !loadingMoreKeys.has(activePaginationKey);
  const hasMoreOpportunities = hasMoreLocalOpportunities || canLoadMoreRemote;
  const isLoadingMore =
    loadingMoreKeys.has(activePaginationKey) ||
    loadMoreFeedbackKey === activePaginationKey;
  const handleLoadMore = useCallback(() => {
    setLoadMoreFeedbackKey(activePaginationKey);
    const nextPageStartIndex = pagedOpportunities.length;
    const scrollToNextPage = () => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index: nextPageStartIndex,
          animated: true,
          viewPosition: 0.08,
        });
      });
    };

    if (hasMoreLocalOpportunities) {
      setTimeout(() => {
        setVisibleLimit((current) => current + OPPORTUNITY_PAGE_SIZE);
        setLoadMoreFeedbackKey((current) =>
          current === activePaginationKey ? null : current,
        );
        setTimeout(scrollToNextPage, 80);
      }, LOAD_MORE_FEEDBACK_MS);
      return;
    }

    if (!activeRemoteFilter || !canLoadMoreRemote) return;

    const offset = feedOffsets[activePaginationKey] ?? 0;
    const subcategory =
      secondaryFilters[appliedFilter] && appliedSecondaryFilter !== 'all'
        ? appliedSecondaryFilter
        : undefined;
    const feedbackDelay = new Promise((resolve) =>
      setTimeout(resolve, LOAD_MORE_FEEDBACK_MS),
    );

    setLoadingMoreKeys((current) => new Set(current).add(activePaginationKey));
    void (async () => {
      const knownIds = new Set(opportunities.map((opportunity) => opportunity.id));
      const incomingOpportunities: Opportunity[] = [];
      let nextOffset = offset;
      let hasMoreRemote = true;
      let visibleNewCount = 0;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const result = await loadOpportunities({
          filter: activeRemoteFilter,
          subcategory,
          limit: OPPORTUNITY_PAGE_SIZE,
          offset: nextOffset,
          countryCode: countryPreference,
          profileType: profileTypePreference,
        });
        nextOffset += result.data.length;
        hasMoreRemote = result.data.length === OPPORTUNITY_PAGE_SIZE;

        for (const opportunity of result.data) {
          if (knownIds.has(opportunity.id)) continue;
          knownIds.add(opportunity.id);
          incomingOpportunities.push(opportunity);

          const prepared = prepareOpportunity(opportunity);
          const isVisibleInCurrentList =
            !hiddenOpportunityIds.has(opportunity.id) &&
            (!secondaryFilters[appliedFilter] ||
              matchesSecondaryFilter(prepared, appliedFilter, appliedSecondaryFilter)) &&
            !shouldHideForLocation(
              prepared,
              countryPreference,
              profileTypePreference,
              false,
              appliedFilter,
            );
          if (isVisibleInCurrentList) visibleNewCount += 1;
        }

        if (visibleNewCount > 0 || !hasMoreRemote) break;
      }

      await feedbackDelay;

      return { incomingOpportunities, nextOffset, hasMoreRemote, visibleNewCount };
    })()
      .then(({ incomingOpportunities, nextOffset, hasMoreRemote, visibleNewCount }) => {
        setOpportunities((current) => mergeOpportunities(current, incomingOpportunities));
        setFeedOffsets((current) => ({
          ...current,
          [activePaginationKey]: nextOffset,
        }));
        setFeedHasMore((current) => ({
          ...current,
          [activePaginationKey]: hasMoreRemote && visibleNewCount > 0,
        }));
        if (visibleNewCount > 0) {
          setVisibleLimit((current) => current + OPPORTUNITY_PAGE_SIZE);
          setTimeout(scrollToNextPage, 80);
        }
      })
      .finally(() => {
        setLoadingMoreKeys((current) => {
          const next = new Set(current);
          next.delete(activePaginationKey);
          return next;
        });
        setLoadMoreFeedbackKey((current) =>
          current === activePaginationKey ? null : current,
        );
      });
  }, [
    activePaginationKey,
    activeRemoteFilter,
    appliedFilter,
    appliedSecondaryFilter,
    canLoadMoreRemote,
    countryPreference,
    feedOffsets,
    hasMoreLocalOpportunities,
    hiddenOpportunityIds,
    opportunities,
    pagedOpportunities.length,
    profileTypePreference,
  ]);

  const renderOpportunity = useCallback(
    ({ item }: { item: Opportunity }) => (
      <OpportunityCard
        opportunity={item}
        isSaved={savedOpportunityIds.has(item.id)}
        isSaving={savingOpportunityIds.has(item.id)}
        isHidden={hiddenOpportunityIds.has(item.id)}
        isHiding={hidingOpportunityIds.has(item.id)}
        onToggleSave={() => handleToggleSave(item.id)}
        onToggleHide={() => handleToggleHide(item.id)}
        onPress={() => handleSelectOpportunity(item)}
        onOpenExternal={() => handleOpenOpportunity(item)}
      />
    ),
    [
      handleOpenOpportunity,
      handleSelectOpportunity,
      handleToggleHide,
      handleToggleSave,
      hiddenOpportunityIds,
      hidingOpportunityIds,
      savedOpportunityIds,
      savingOpportunityIds,
    ],
  );

  if (!authReady) {
    return (
      <LinearGradient colors={['#071A1C', '#081112', '#050808']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          <View style={styles.authScreen}>
            <ActivityIndicator color="#D9FF57" />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!session) {
    return (
      <LinearGradient colors={['#071A1C', '#081112', '#050808']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          <View style={styles.loginScreen}>
            <View style={styles.loginHeader}>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={prizenAppIcon}
                style={styles.loginLogo}
              />
              <Text style={styles.loginTitle}>PRIZEN</Text>
              <Text style={styles.loginSubtitle}>Sign in to track and save opportunities.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={authLoading || !isSupabaseConfigured}
              onPress={handleGoogleSignIn}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.authButtonPressed,
                (authLoading || !isSupabaseConfigured) && styles.authButtonDisabled,
              ]}
            >
              {authLoading ? (
                <ActivityIndicator size="small" color="#071A1C" />
              ) : (
                <Text style={styles.loginButtonText}>Continue with Google</Text>
              )}
            </Pressable>
            {!isSupabaseConfigured && (
              <Text style={styles.loginNotice}>Supabase is not configured.</Text>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#071A1C', '#081112', '#050808']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />

        <Modal
          animationType="fade"
          transparent
          visible={profileVisible}
          onRequestClose={() => setProfileVisible(false)}
        >
          <View style={styles.profileOverlay}>
            <Pressable style={styles.profileBackdrop} onPress={() => setProfileVisible(false)} />
            <View style={styles.profileSheet}>
              <View style={styles.profileSheetTop}>
                <Text style={styles.profileSheetTitle}>Profile</Text>
                <Pressable
                  accessibilityLabel="Close profile"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setProfileVisible(false)}
                  style={styles.detailCloseButton}
                >
                  <Text style={styles.detailCloseText}>×</Text>
                </Pressable>
              </View>
              <View style={styles.settingsPanel}>
                <View style={styles.profileHeader}>
                  <View style={styles.profileAvatar}>
                    {profileAvatarUrl ? (
                      <Image
                        source={{ uri: profileAvatarUrl }}
                        resizeMode="cover"
                        accessibilityLabel={profileName}
                        style={styles.profileAvatarImage}
                      />
                    ) : (
                      <Text style={styles.profileAvatarText}>{profileInitials || 'P'}</Text>
                    )}
                  </View>
                  <View style={styles.profileCopy}>
                    <Text style={styles.settingsTitle}>{profileName}</Text>
                    <Text style={styles.settingsEmail}>{session.user.email ?? 'Google account'}</Text>
                    <View style={styles.providerBadge}>
                      <Text style={styles.providerBadgeText}>{profileProvider.toUpperCase()} LOGIN</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.profileMeta}>
                  <Text style={styles.settingsLabel}>Country</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setCountryPickerVisible(true)}
                    style={({ pressed }) => [
                      styles.countryPreferenceButton,
                      pressed && styles.profileButtonPressed,
                    ]}
                  >
                    <Text style={styles.countryPreferenceText}>
                      {getCountryLabel(countryPreference)}
                    </Text>
                    <Text style={styles.countryPreferenceAction}>Change</Text>
                  </Pressable>
                  <Text style={styles.settingsLabel}>Profile type</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setProfileTypePickerVisible(true)}
                    style={({ pressed }) => [
                      styles.countryPreferenceButton,
                      pressed && styles.profileButtonPressed,
                    ]}
                  >
                    <Text style={styles.countryPreferenceText}>
                      {getProfileTypeLabel(profileTypePreference)}
                    </Text>
                    <Text style={styles.countryPreferenceAction}>Change</Text>
                  </Pressable>
                </View>
                <View style={styles.legalLinks}>
                  {legalLinks.map((item) => (
                    <Pressable
                      key={item.url}
                      accessibilityLabel={`Open ${item.label}`}
                      accessibilityRole="link"
                      onPress={() => handleOpenUrl(item.url)}
                      style={({ pressed }) => [
                        styles.legalLinkButton,
                        pressed && styles.profileButtonPressed,
                      ]}
                    >
                      <Text style={styles.legalLinkText}>{item.label}</Text>
                      <Text style={styles.legalLinkArrow}>↗</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={authLoading}
                  onPress={handleSignOut}
                  style={({ pressed }) => [
                    styles.logoutButton,
                    pressed && styles.authButtonPressed,
                    authLoading && styles.authButtonDisabled,
                  ]}
                >
                  {authLoading ? (
                    <ActivityIndicator size="small" color="#071A1C" />
                  ) : (
                    <Text style={styles.logoutButtonText}>Sign out</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          animationType="fade"
          transparent
          visible={Boolean(session) && countryPreferenceLoaded && countryPickerVisible}
          onRequestClose={() => {
            if (countryPreference) setCountryPickerVisible(false);
          }}
        >
          <View style={styles.profileOverlay}>
            {countryPreference && (
              <Pressable
                style={styles.profileBackdrop}
                onPress={() => setCountryPickerVisible(false)}
              />
            )}
            <View style={styles.countrySheet}>
              <View style={styles.profileSheetTop}>
                <Text style={styles.profileSheetTitle}>Your country</Text>
                {countryPreference && (
                  <Pressable
                    accessibilityLabel="Close country selector"
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() => setCountryPickerVisible(false)}
                    style={styles.detailCloseButton}
                  >
                    <Text style={styles.detailCloseText}>Γ—</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.countryIntro}>
                Prizen will hide giveaways that are only useful in another country or a specific local area.
              </Text>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.countryList}
              >
                {countryOptions.map((country) => {
                  const active = countryPreference === country.code;
                  return (
                    <Pressable
                      key={country.code}
                      accessibilityRole="button"
                      onPress={() => handleSelectCountry(country.code)}
                      style={({ pressed }) => [
                        styles.countryOption,
                        active && styles.countryOptionActive,
                        pressed && styles.profileButtonPressed,
                      ]}
                    >
                      <View>
                        <Text
                          style={[
                            styles.countryOptionLabel,
                            active && styles.countryOptionLabelActive,
                          ]}
                        >
                          {country.label}
                        </Text>
                        <Text style={styles.countryOptionCode}>{country.code}</Text>
                      </View>
                      {active && <Text style={styles.countryOptionCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          animationType="fade"
          transparent
          visible={Boolean(session) && profileTypePreferenceLoaded && profileTypePickerVisible}
          onRequestClose={() => setProfileTypePickerVisible(false)}
        >
          <View style={styles.profileOverlay}>
            <Pressable
              style={styles.profileBackdrop}
              onPress={() => setProfileTypePickerVisible(false)}
            />
            <View style={styles.countrySheet}>
              <View style={styles.profileSheetTop}>
                <Text style={styles.profileSheetTitle}>Profile type</Text>
                <Pressable
                  accessibilityLabel="Close profile type selector"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setProfileTypePickerVisible(false)}
                  style={styles.detailCloseButton}
                >
                  <Text style={styles.detailCloseText}>Γ—</Text>
                </Pressable>
              </View>
              <Text style={styles.countryIntro}>
                Prizen will hide opportunities that are clearly meant for another type of applicant.
              </Text>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.countryList}
              >
                {profileTypeOptions.map((option) => {
                  const active = profileTypePreference === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      onPress={() => handleSelectProfileType(option.id)}
                      style={({ pressed }) => [
                        styles.countryOption,
                        active && styles.countryOptionActive,
                        pressed && styles.profileButtonPressed,
                      ]}
                    >
                      <View>
                        <Text
                          style={[
                            styles.countryOptionLabel,
                            active && styles.countryOptionLabelActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                        <Text style={styles.countryOptionCode}>{option.id.toUpperCase()}</Text>
                      </View>
                      {active && <Text style={styles.countryOptionCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          animationType="fade"
          transparent
          visible={Boolean(selectedOpportunity)}
          onRequestClose={() => setSelectedOpportunity(null)}
        >
          <View style={styles.detailOverlay}>
            <View style={styles.detailSheet}>
              {selectedOpportunity && (
                <>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.detailScrollContent}
                >
                  <View style={styles.detailHeader}>
                    <View style={styles.detailHeaderText}>
                      <Text style={styles.detailSource}>
                        {selectedOpportunity.source_type === 'social'
                          ? `INSTAGRAM @${selectedOpportunity.source}`.toUpperCase()
                          : selectedOpportunity.source.toUpperCase()}
                      </Text>
                      <Text style={styles.detailTitle}>{cleanDisplayText(selectedOpportunity.title)}</Text>
                      <Text style={styles.detailOrg}>{selectedOpportunity.organization}</Text>
                    </View>
                    <Pressable
                      accessibilityLabel="Close details"
                      accessibilityRole="button"
                      hitSlop={10}
                      onPress={() => setSelectedOpportunity(null)}
                      style={styles.detailCloseButton}
                    >
                      <Text style={styles.detailCloseText}>×</Text>
                    </Pressable>
                  </View>

                  {selectedOpportunity.image_url && (
                    <Image
                      source={{ uri: selectedOpportunity.image_url }}
                      resizeMode="cover"
                      accessibilityLabel={selectedOpportunity.title}
                      style={styles.detailImage}
                    />
                  )}

                  <View style={styles.detailStats}>
                    <View style={styles.detailStat}>
                      <Text style={styles.detailStatLabel}>Deadline</Text>
                      <Text style={styles.detailStatValue}>
                        {formatDetailDate(selectedOpportunity.deadline)}
                      </Text>
                    </View>
                    <View style={styles.detailStat}>
                      <Text style={styles.detailStatLabel}>Reward</Text>
                      <Text style={styles.detailStatValue}>{getRewardLabel(selectedOpportunity)}</Text>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Summary</Text>
                    <Text style={styles.detailBody}>
                      {cleanDisplayText(selectedOpportunity.clean_summary || selectedOpportunity.summary)}
                    </Text>
                  </View>

                  {selectedOpportunity.prize_description && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Prize</Text>
                      <Text style={styles.detailBody}>
                        {cleanDisplayText(selectedOpportunity.prize_description)}
                      </Text>
                    </View>
                  )}

                  {selectedOpportunity.eligibility && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Eligibility</Text>
                      <Text style={styles.detailBody}>
                        {cleanDisplayText(selectedOpportunity.eligibility)}
                      </Text>
                    </View>
                  )}

                  {selectedOpportunity.participation_steps?.length ? (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>How to enter</Text>
                      {selectedOpportunity.participation_steps.map((step, index) => (
                        <View key={`${step}-${index}`} style={styles.detailStep}>
                          <Text style={styles.detailStepIndex}>{index + 1}</Text>
                          <Text style={styles.detailStepText}>{step}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {selectedOpportunity.tags.length > 0 && (
                    <View style={styles.detailTagList}>
                      {selectedOpportunity.tags.slice(0, 8).map((tag) => (
                        <View key={tag} style={styles.detailTag}>
                          <Text style={styles.detailTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                </ScrollView>
                <View style={styles.detailActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={savingOpportunityIds.has(selectedOpportunity.id)}
                      onPress={() => handleToggleSave(selectedOpportunity.id)}
                      style={[
                        styles.detailSecondaryButton,
                        savedOpportunityIds.has(selectedOpportunity.id) && styles.detailSecondaryButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.detailSecondaryText,
                          savedOpportunityIds.has(selectedOpportunity.id) && styles.detailSecondaryTextActive,
                        ]}
                      >
                        {savedOpportunityIds.has(selectedOpportunity.id) ? 'Saved' : 'Save'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={hidingOpportunityIds.has(selectedOpportunity.id)}
                      onPress={() => handleToggleHide(selectedOpportunity.id)}
                      style={[
                        styles.detailSecondaryButton,
                        hiddenOpportunityIds.has(selectedOpportunity.id) && styles.detailMutedButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.detailSecondaryText,
                          hiddenOpportunityIds.has(selectedOpportunity.id) && styles.detailMutedTextActive,
                        ]}
                      >
                        {hiddenOpportunityIds.has(selectedOpportunity.id) ? 'Unhide' : 'Hide'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => handleOpenOpportunity(selectedOpportunity)}
                      style={styles.detailPrimaryButton}
                    >
                      <Text style={styles.detailPrimaryText}>Open link</Text>
                    </Pressable>
                </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        <FlatList
          ref={listRef}
          data={isSwitchingOpportunities ? [] : pagedOpportunities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, info.averageItemLength * info.index),
              animated: true,
            });
          }}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor="#D9FF57"
              onRefresh={handleRefresh}
            />
          }
          ListHeaderComponent={
            <>
              <View style={styles.topBar}>
                <Pressable
                  accessibilityLabel="Open profile"
                  accessibilityRole="button"
                  onPress={() => setProfileVisible(true)}
                  style={({ pressed }) => [styles.profileButton, pressed && styles.profileButtonPressed]}
                >
                  {profileAvatarUrl ? (
                    <Image
                      source={{ uri: profileAvatarUrl }}
                      resizeMode="cover"
                      accessibilityLabel={profileName}
                      style={styles.profileButtonImage}
                    />
                  ) : (
                    <Text style={styles.profileButtonText}>{profileInitials || 'P'}</Text>
                  )}
                </Pressable>
                <View style={styles.topBarCopy}>
                  <View style={styles.brandMarkRow}>
                    <Image
                      accessibilityIgnoresInvertColors
                      resizeMode="contain"
                      source={prizenMark}
                      style={styles.homeLogo}
                    />
                    <Text style={styles.eyebrow}>PRIZEN</Text>
                  </View>
                  <Text style={styles.greeting}>Find your next opportunity.</Text>
                </View>
                <Pressable
                  accessibilityLabel={searchVisible ? 'Close search' : 'Open search'}
                  accessibilityRole="button"
                  onPress={() => {
                    setSearchVisible((current) => {
                      if (current) setQuery('');
                      return !current;
                    });
                  }}
                  style={({ pressed }) => [
                    styles.headerSearchButton,
                    searchVisible && styles.headerSearchButtonActive,
                    pressed && styles.profileButtonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.headerSearchIcon,
                      searchVisible && styles.headerSearchIconActive,
                    ]}
                  >
                    {searchVisible ? '×' : '⌕'}
                  </Text>
                </Pressable>
              </View>

              {searchVisible && (
                <View style={styles.searchBox}>
                  <Text style={styles.searchIcon}>⌕</Text>
                  <TextInput
                    autoFocus
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search by title, brand, or reward"
                    placeholderTextColor="#718082"
                    style={styles.searchInput}
                    returnKeyType="search"
                  />
                  {query.length > 0 && (
                    <Pressable onPress={() => setQuery('')} hitSlop={12}>
                      <Text style={styles.clearIcon}>×</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                {visibleFilters.map((item) => {
                  const active = filter === item.id;
                  const count = displayFilterCounts[item.id];
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        if (filter !== item.id) {
                          listRef.current?.scrollToOffset({ offset: 0, animated: false });
                          setVisibleLimit(OPPORTUNITY_PAGE_SIZE);
                          setFilter(item.id);
                          setActiveSecondaryFilters((current) => ({
                            ...current,
                            [item.id]: firstVisibleSecondaryFilter(item.id),
                          }));
                        }
                      }}
                      style={[styles.filterButton, active && styles.filterButtonActive]}
                    >
                      <View style={[styles.filterCountBadge, active && styles.filterCountBadgeActive]}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.filterCountText,
                            active && styles.filterCountTextActive,
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                      <Text style={[styles.filterText, active && styles.filterTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {visibleSecondaryFilters && visibleSecondaryFilters.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subfilters}
                >
                  {visibleSecondaryFilters.map((item) => {
                    const active = activeSecondaryFilter === item.id;
                    const count = secondaryFilterCounts[filter]?.[item.id] ?? 0;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          if (activeSecondaryFilter === item.id) {
                            return;
                          }
                          listRef.current?.scrollToOffset({ offset: 0, animated: false });
                          setVisibleLimit(OPPORTUNITY_PAGE_SIZE);
                          setActiveSecondaryFilters((current) => ({
                            ...current,
                            [filter]: item.id,
                          }));
                        }}
                        style={[styles.subfilterButton, active && styles.subfilterButtonActive]}
                      >
                        <Text
                          style={[styles.subfilterText, active && styles.subfilterTextActive]}
                        >
                          {item.label}
                        </Text>
                        <View
                          style={[
                            styles.subfilterCountBadge,
                            active && styles.subfilterCountBadgeActive,
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.subfilterCountText,
                              active && styles.subfilterCountTextActive,
                            ]}
                          >
                            {count}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>{sectionTitle}</Text>
                <Text style={styles.resultCount}>
                  {isSwitchingOpportunities
                    ? 'UPDATING'
                    : isLoadingSelectedFeed
                      ? 'LOADING'
                    : `${pagedOpportunities.length}/${visibleOpportunities.length} RESULTS`}
                </Text>
              </View>

              {notice && (
                <Pressable
                  onPress={() => Linking.openURL('https://supabase.com/dashboard')}
                  style={styles.notice}
                >
                  <Text style={styles.noticeDot}>●</Text>
                  <Text style={styles.noticeText}>{notice}</Text>
                </Pressable>
              )}
            </>
          }
          renderItem={renderOpportunity}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            loading || isSwitchingOpportunities || isLoadingSelectedFeed ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color="#D9FF57" />
                <Text style={styles.emptyText}>
                  {isSwitchingOpportunities || isLoadingSelectedFeed
                    ? 'Updating opportunities...'
                    : 'Loading opportunities...'}
                </Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyGlyph}>◎</Text>
                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                <Text style={styles.emptyText}>{emptyMessage}</Text>
              </View>
            )
          }
          ListFooterComponent={
            <View style={styles.footer}>
              {!isSwitchingOpportunities && (hasMoreOpportunities || isLoadingMore) && (
                <Pressable
                  accessibilityRole="button"
                  disabled={isLoadingMore}
                  onPress={handleLoadMore}
                  style={({ pressed }) => [
                    styles.loadMoreButton,
                    isLoadingMore && styles.loadMoreButtonLoading,
                    pressed && styles.authButtonPressed,
                  ]}
                >
                  {isLoadingMore ? (
                    <View style={styles.loadMoreLoadingContent}>
                      <ActivityIndicator size="small" color="#071A1C" />
                      <Text style={styles.loadMoreText}>Loading...</Text>
                    </View>
                  ) : (
                    <Text style={styles.loadMoreText}>Load more</Text>
                  )}
                </Pressable>
              )}
              <Text style={styles.footerText}>Powered by Supabase · refreshed on demand</Text>
            </View>
          }
        />
        {showScrollTopButton && (
          <Pressable
            accessibilityLabel="Scroll to top"
            accessibilityRole="button"
            hitSlop={10}
            onPress={handleScrollToTop}
            style={({ pressed }) => [
              styles.scrollTopButton,
              pressed && styles.scrollTopButtonPressed,
            ]}
          >
            <Text style={styles.scrollTopIcon}>↑</Text>
          </Pressable>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
  },
  scrollTopButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 14 : 56,
    alignSelf: 'center',
    minWidth: 56,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 20, 21, 0.92)',
    borderWidth: 1,
    borderColor: '#3C5657',
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    zIndex: 20,
  },
  scrollTopButtonPressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
  scrollTopIcon: {
    color: '#D9FF57',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 30 },
  topBar: {
    minHeight: 82,
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 12,
    flexDirection: 'row',
  },
  profileButton: {
    position: 'absolute',
    left: 0,
    top: 5,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#304143',
    backgroundColor: '#172224',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileButtonPressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  profileButtonImage: { width: '100%', height: '100%' },
  profileButtonText: { color: '#D9FF57', fontSize: 17, fontWeight: '900' },
  headerSearchButton: {
    position: 'absolute',
    right: 0,
    top: 5,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#304143',
    backgroundColor: '#172224',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSearchButtonActive: {
    backgroundColor: '#D9FF57',
    borderColor: '#D9FF57',
  },
  headerSearchIcon: { color: '#D9FF57', fontSize: 25, lineHeight: 27, fontWeight: '900' },
  headerSearchIconActive: { color: '#071A1C' },
  topBarCopy: {
    flex: 1,
    minHeight: 82,
    marginLeft: 60,
    marginRight: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  homeLogo: {
    width: 44,
    height: 44,
  },
  eyebrow: { color: '#D9FF57', fontSize: 20, fontWeight: '900', letterSpacing: 0 },
  greeting: { color: '#EAF3F1', fontSize: 12, marginTop: 7, textAlign: 'center' },
  authScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginScreen: {
    flex: 1,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginHeader: { alignItems: 'center', marginBottom: 28 },
  loginLogo: {
    width: 118,
    height: 118,
    borderRadius: 26,
    marginBottom: 18,
  },
  loginTitle: { color: '#D9FF57', fontSize: 34, fontWeight: '900', letterSpacing: 2 },
  loginSubtitle: {
    color: '#B8C7C4',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 280,
  },
  loginButton: {
    width: '100%',
    maxWidth: 320,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#D9FF57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authButtonPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  authButtonDisabled: { opacity: 0.5 },
  loginButtonText: { color: '#071A1C', fontSize: 15, fontWeight: '900' },
  loginNotice: { color: '#CECFA7', fontSize: 12, marginTop: 14, textAlign: 'center' },
  searchBox: {
    height: 50,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#243436',
    backgroundColor: '#0D1718',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchIcon: { color: '#D9FF57', fontSize: 22, marginRight: 9 },
  searchInput: { flex: 1, height: '100%', color: '#EDF4F2', fontSize: 15 },
  clearIcon: { color: '#91A09F', fontSize: 24 },
  filters: { flexDirection: 'row', gap: 9, marginTop: 14, paddingTop: 9 },
  filterButton: {
    minHeight: 39,
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: '#111B1C',
    borderWidth: 1,
    borderColor: '#273638',
    justifyContent: 'center',
  },
  filterButtonActive: { backgroundColor: '#D9FF57', borderColor: '#D9FF57' },
  filterText: { color: '#91A09F', fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: '#071A1C' },
  filterCountBadge: {
    position: 'absolute',
    top: -9,
    right: -10,
    minWidth: 36,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: '#203133',
    borderWidth: 1,
    borderColor: '#314446',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountBadgeActive: {
    backgroundColor: '#071A1C',
    borderColor: '#071A1C',
  },
  filterCountText: {
    color: '#D9FF57',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
    width: 24,
    textAlign: 'center',
  },
  filterCountTextActive: { color: '#D9FF57' },
  subfilters: { flexDirection: 'row', gap: 7, marginTop: 10 },
  subfilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: '#0B1415',
    borderWidth: 1,
    borderColor: '#223032',
  },
  subfilterButtonActive: { backgroundColor: '#193C39', borderColor: '#7DE0CF' },
  subfilterText: { color: '#7E8C8E', fontSize: 12, fontWeight: '700' },
  subfilterTextActive: { color: '#7DE0CF' },
  subfilterCountBadge: {
    minWidth: 22,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#132123',
    borderWidth: 1,
    borderColor: '#2B3B3E',
  },
  subfilterCountBadgeActive: {
    backgroundColor: '#D9FF57',
    borderColor: '#D9FF57',
  },
  subfilterCountText: {
    color: '#AFC0BD',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
    textAlign: 'center',
  },
  subfilterCountTextActive: { color: '#071A1C' },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 28,
    marginBottom: 14,
  },
  sectionTitle: { color: '#F2F6F4', fontSize: 20, fontWeight: '800' },
  resultCount: { color: '#647274', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#252516',
    borderWidth: 1,
    borderColor: '#454420',
    marginBottom: 14,
  },
  noticeDot: { color: '#D9FF57', fontSize: 9, marginRight: 9 },
  noticeText: { flex: 1, color: '#CECFA7', fontSize: 12, lineHeight: 17 },
  profileOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 58,
  },
  profileBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  profileSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#253537',
    backgroundColor: '#0A1213',
    padding: 12,
  },
  profileSheetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 6,
    marginBottom: 2,
  },
  profileSheetTitle: { color: '#F2F6F4', fontSize: 16, fontWeight: '900' },
  detailOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  detailSheet: {
    height: '88%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: '#253537',
    backgroundColor: '#0E1718',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'android' ? 18 : 24,
  },
  detailScrollContent: { paddingBottom: 18 },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  detailHeaderText: { flex: 1 },
  detailSource: { color: '#D9FF57', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  detailTitle: {
    color: '#F3F7F5',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    marginTop: 8,
  },
  detailOrg: { color: '#7DA19D', fontSize: 13, fontWeight: '700', marginTop: 8 },
  detailCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#304143',
    backgroundColor: '#10191A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseText: { color: '#DCE8E5', fontSize: 24, lineHeight: 26, fontWeight: '700' },
  detailImage: {
    width: '100%',
    height: 210,
    borderRadius: 16,
    marginTop: 18,
    backgroundColor: '#182122',
  },
  detailStats: { flexDirection: 'row', gap: 10, marginTop: 18 },
  detailStat: {
    flex: 1,
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#223032',
    backgroundColor: '#10191A',
    padding: 12,
  },
  detailStatLabel: { color: '#7DE0CF', fontSize: 10, fontWeight: '900' },
  detailStatValue: { color: '#F2F6F4', fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 7 },
  detailSection: { marginTop: 22 },
  detailSectionTitle: { color: '#F2F6F4', fontSize: 15, fontWeight: '900' },
  detailBody: { color: '#A8B6B4', fontSize: 14, lineHeight: 21, marginTop: 9 },
  detailStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
  },
  detailStepIndex: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#D9FF57',
    color: '#071A1C',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 24,
    textAlign: 'center',
  },
  detailStepText: { flex: 1, color: '#A8B6B4', fontSize: 14, lineHeight: 21 },
  detailTagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 20 },
  detailTag: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1A2526',
    borderWidth: 1,
    borderColor: '#2A3839',
  },
  detailTagText: { color: '#899797', fontSize: 10, fontWeight: '800' },
  detailActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 30 : 12,
    borderTopWidth: 1,
    borderTopColor: '#253537',
    backgroundColor: '#0E1718',
  },
  detailPrimaryButton: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#D9FF57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailPrimaryText: { color: '#071A1C', fontSize: 14, fontWeight: '900' },
  detailSecondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#304143',
    backgroundColor: '#10191A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSecondaryButtonActive: { backgroundColor: '#D9FF57', borderColor: '#D9FF57' },
  detailMutedButtonActive: { backgroundColor: '#263536', borderColor: '#4B6263' },
  detailSecondaryText: { color: '#DCE8E5', fontSize: 14, fontWeight: '900' },
  detailSecondaryTextActive: { color: '#071A1C' },
  detailMutedTextActive: { color: '#DCE8E5' },
  settingsPanel: {
    padding: 6,
    marginTop: 8,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileAvatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#304143',
    backgroundColor: '#172224',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileAvatarImage: { width: '100%', height: '100%' },
  profileAvatarText: { color: '#D9FF57', fontSize: 23, fontWeight: '900' },
  profileCopy: { flex: 1, minWidth: 0 },
  settingsTitle: { color: '#F2F6F4', fontSize: 20, fontWeight: '900' },
  settingsLabel: { color: '#7DE0CF', fontSize: 10, fontWeight: '900', marginTop: 18 },
  settingsEmail: { color: '#DCE8E5', fontSize: 14, fontWeight: '700', marginTop: 6 },
  providerBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334648',
    backgroundColor: '#111B1C',
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 9,
  },
  providerBadgeText: { color: '#D9FF57', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  profileMeta: {
    borderTopWidth: 1,
    borderTopColor: '#223032',
    marginTop: 18,
    paddingTop: 2,
  },
  countryPreferenceButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#223032',
    backgroundColor: '#10191A',
    paddingHorizontal: 12,
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  countryPreferenceText: { flex: 1, color: '#DCE8E5', fontSize: 13, fontWeight: '800' },
  countryPreferenceAction: { color: '#D9FF57', fontSize: 12, fontWeight: '900' },
  countrySheet: {
    maxHeight: '78%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#253537',
    backgroundColor: '#0A1213',
    padding: 12,
  },
  countryIntro: {
    color: '#A8B6B4',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 6,
    marginTop: 8,
  },
  countryList: { gap: 8, paddingTop: 14, paddingBottom: 4 },
  countryOption: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#223032',
    backgroundColor: '#10191A',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  countryOptionActive: { borderColor: '#D9FF57', backgroundColor: '#172218' },
  countryOptionLabel: { color: '#DCE8E5', fontSize: 14, fontWeight: '900' },
  countryOptionLabelActive: { color: '#D9FF57' },
  countryOptionCode: { color: '#718082', fontSize: 10, fontWeight: '900', marginTop: 3 },
  countryOptionCheck: { color: '#D9FF57', fontSize: 18, fontWeight: '900' },
  legalLinks: {
    borderTopWidth: 1,
    borderTopColor: '#223032',
    marginTop: 18,
    paddingTop: 10,
    gap: 8,
  },
  legalLinkButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#223032',
    backgroundColor: '#10191A',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  legalLinkText: { color: '#DCE8E5', fontSize: 13, fontWeight: '800' },
  legalLinkArrow: { color: '#D9FF57', fontSize: 15, fontWeight: '900' },
  logoutButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#D9FF57',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  logoutButtonText: { color: '#071A1C', fontSize: 14, fontWeight: '900' },
  separator: { height: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 55 },
  emptyGlyph: { color: '#D9FF57', fontSize: 38, marginBottom: 10 },
  emptyTitle: { color: '#F2F6F4', fontWeight: '800', fontSize: 17 },
  emptyText: { color: '#718082', fontSize: 13, marginTop: 7 },
  footer: { alignItems: 'center', paddingVertical: 28, gap: 16 },
  loadMoreButton: {
    minWidth: 156,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#D9FF57',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  loadMoreButtonLoading: { opacity: 0.9, backgroundColor: '#C9F044' },
  loadMoreLoadingContent: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  loadMoreText: { color: '#071A1C', fontSize: 14, fontWeight: '900' },
  footerText: { color: '#455355', fontSize: 10, letterSpacing: 0.4 },
});
