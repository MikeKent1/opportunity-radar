import { createClient } from 'npm:@supabase/supabase-js@2';

type Provider =
  | 'gamerpower'
  | 'epicgames'
  | 'freetogame'
  | 'cheapshark'
  | 'eufunding'
  | 'ted'
  | 'grants';

type NormalizedOpportunity = {
  external_id: string;
  source: Provider;
  title: string;
  organization: string;
  summary: string;
  url: string;
  image_url: string | null;
  amount: number | null;
  currency: string;
  deadline: string | null;
  tags: string[];
  status: 'active';
  published_at: string;
  raw_data: unknown;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];

const plainText = (value: unknown) =>
  text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchGrants(): Promise<NormalizedOpportunity[]> {
  const apiKey = Deno.env.get('GRANTS_API_KEY');
  const endpoint =
    Deno.env.get('GRANTS_API_URL') ??
    'https://api.simpler.grants.gov/v1/opportunities/search';

  if (!apiKey) return [];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      pagination: {
        page_offset: 1,
        page_size: 50,
        sort_order: [{ order_by: 'post_date', sort_direction: 'descending' }],
      },
      filters: { opportunity_status: { one_of: ['posted', 'forecasted'] } },
    }),
  });

  if (!response.ok) {
    throw new Error(`Grants API returned ${response.status}`);
  }

  const payload = await response.json();
  const items = asArray(payload?.data ?? payload?.opportunities ?? payload?.results);

  return items.map((item, index) => {
    const id = text(item.opportunity_id ?? item.id ?? item.opportunity_number, `grant-${index}`);
    const agency = item.agency as Record<string, unknown> | undefined;
    const summary = asRecord(item.summary);
    const fundingCategories = Array.isArray(summary?.funding_categories)
      ? summary.funding_categories.map((category) =>
          text(category)
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
        )
      : [];

    return {
      external_id: id,
      source: 'grants',
      title: text(item.opportunity_title ?? item.title, 'Grant opportunity'),
      organization: text(
        item.agency_name ?? item.agency ?? agency?.agency_name,
        'Grants.gov',
      ),
      summary: plainText(
        summary?.summary_description ??
          item.summary_description ??
          item.description,
      ),
      url: text(
        item.opportunity_url,
        `https://simpler.grants.gov/opportunity/${encodeURIComponent(id)}`,
      ),
      image_url: null,
      amount:
        Number(
          summary?.award_ceiling ??
            summary?.estimated_total_program_funding ??
            item.award_ceiling ??
            item.maximum_award ??
            item.estimated_total_program_funding,
        ) ||
        null,
      currency: 'USD',
      deadline: text(
        summary?.close_date ??
          summary?.forecasted_close_date ??
          item.close_date ??
          item.deadline,
      ) || null,
      tags: ['US Grant', text(item.category, 'Funding'), ...fundingCategories].slice(0, 5),
      status: 'active',
      published_at: text(
        summary?.post_date ??
          summary?.forecasted_post_date ??
          item.post_date ??
          item.published_at,
        new Date().toISOString(),
      ),
      raw_data: item,
    };
  });
}

function gamerPowerDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw || raw === 'N/A') return null;
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function gamerPowerWorth(value: unknown): number | null {
  const raw = text(value);
  if (!raw || raw === 'N/A') return null;
  const amount = Number(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

async function fetchGamerPower(): Promise<NormalizedOpportunity[]> {
  const endpoint =
    Deno.env.get('GAMERPOWER_API_URL') ??
    'https://www.gamerpower.com/api/giveaways?sort-by=date';

  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 201) return [];
    throw new Error(`GamerPower API returned ${response.status}`);
  }

  const payload = await response.json();
  const items = asArray(payload);
  const now = Date.now();

  return items
    .filter((item) => {
      const deadline = gamerPowerDate(item.end_date);
      return text(item.status).toLowerCase() === 'active' && (!deadline || Date.parse(deadline) >= now);
    })
    .map((item, index) => {
      const id = text(item.id, `gamerpower-${index}`);
      const platforms = text(item.platforms)
        .split(',')
        .map((platform) => platform.trim())
        .filter(Boolean);
      const giveawayType = text(item.type, 'Giveaway');

      return {
        external_id: id,
        source: 'gamerpower',
        title: text(item.title, 'Gaming giveaway'),
        organization: 'GamerPower',
        summary: text(item.description),
        url: text(
          item.open_giveaway_url ?? item.open_giveaway ?? item.gamerpower_url,
          'https://www.gamerpower.com/',
        ),
        image_url: text(item.image ?? item.thumbnail) || null,
        amount: gamerPowerWorth(item.worth),
        currency: 'USD',
        deadline: gamerPowerDate(item.end_date),
        tags: [giveawayType, ...platforms].slice(0, 5),
        status: 'active',
        published_at:
          gamerPowerDate(item.published_date) ?? new Date().toISOString(),
        raw_data: item,
      };
    });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function epicStoreUrl(item: Record<string, unknown>): string {
  const mappings = [
    ...asArray(asRecord(item.catalogNs)?.mappings),
    ...asArray(item.offerMappings),
  ];
  const pageSlug = text(mappings[0]?.pageSlug);
  const productSlug = text(item.productSlug).replace(/\/home$/, '');
  const slug = pageSlug || productSlug;

  return slug
    ? `https://store.epicgames.com/en-US/p/${slug}`
    : 'https://store.epicgames.com/en-US/free-games';
}

function epicImage(item: Record<string, unknown>): string | null {
  const images = asArray(item.keyImages);
  const preferredTypes = ['OfferImageWide', 'featuredMedia', 'Thumbnail'];

  for (const type of preferredTypes) {
    const image = images.find((candidate) => text(candidate.type) === type);
    const url = text(image?.url);
    if (url) return url;
  }

  return text(images[0]?.url) || null;
}

function activeEpicPromotion(item: Record<string, unknown>, now: number) {
  const promotions = asRecord(item.promotions);
  const promotionalOffers = asArray(promotions?.promotionalOffers);

  for (const group of promotionalOffers) {
    for (const promotion of asArray(group.promotionalOffers)) {
      const startDate = Date.parse(text(promotion.startDate));
      const endDate = Date.parse(text(promotion.endDate));
      const discount = asRecord(promotion.discountSetting);

      if (
        Number(discount?.discountPercentage) === 0 &&
        Number.isFinite(startDate) &&
        Number.isFinite(endDate) &&
        startDate <= now &&
        endDate > now
      ) {
        return { startDate, endDate };
      }
    }
  }

  return null;
}

async function fetchEpicGames(): Promise<NormalizedOpportunity[]> {
  const endpoint =
    Deno.env.get('EPIC_GAMES_API_URL') ??
    'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';

  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Epic Games endpoint returned ${response.status}`);
  }

  const payload = await response.json();
  const items = asArray(payload?.data?.Catalog?.searchStore?.elements);
  const now = Date.now();

  return items.flatMap((item) => {
    const promotion = activeEpicPromotion(item, now);
    if (!promotion) return [];

    const price = asRecord(asRecord(item.price)?.totalPrice);
    const seller = asRecord(item.seller);
    const originalPrice = Number(price?.originalPrice);
    const currency = text(price?.currencyCode, 'USD');

    return [{
      external_id: text(item.id, text(item.namespace)),
      source: 'epicgames' as const,
      title: text(item.title, 'Epic Games Store giveaway'),
      organization: text(seller?.name, 'Epic Games Store'),
      summary: text(item.description),
      url: epicStoreUrl(item),
      image_url: epicImage(item),
      amount: Number.isFinite(originalPrice) && originalPrice > 0 ? originalPrice / 100 : null,
      currency,
      deadline: new Date(promotion.endDate).toISOString(),
      tags: ['Game', 'PC', 'Epic Games Store'],
      status: 'active' as const,
      published_at: new Date(promotion.startDate).toISOString(),
      raw_data: item,
    }];
  });
}

async function fetchFreeToGame(): Promise<NormalizedOpportunity[]> {
  const endpoint =
    Deno.env.get('FREETOGAME_API_URL') ??
    'https://www.freetogame.com/api/games?sort-by=release-date';

  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`FreeToGame API returned ${response.status}`);
  }

  const payload = await response.json();
  const items = asArray(payload);

  return items.map((item, index) => {
    const releaseDate = text(item.release_date);
    const publishedAt = releaseDate
      ? new Date(`${releaseDate}T00:00:00Z`).toISOString()
      : new Date().toISOString();

    return {
      external_id: text(item.id, `freetogame-${index}`),
      source: 'freetogame',
      title: text(item.title, 'Free-to-play game'),
      organization: text(item.publisher ?? item.developer, 'FreeToGame'),
      summary: text(item.short_description),
      url: text(
        item.game_url ?? item.freetogame_profile_url,
        'https://www.freetogame.com/',
      ),
      image_url: text(item.thumbnail) || null,
      amount: null,
      currency: 'USD',
      deadline: null,
      tags: [text(item.genre, 'Free to Play'), text(item.platform)]
        .filter(Boolean),
      status: 'active',
      published_at: publishedAt,
      raw_data: item,
    };
  });
}

async function fetchCheapShark(): Promise<NormalizedOpportunity[]> {
  const endpoint =
    Deno.env.get('CHEAPSHARK_API_URL') ??
    'https://www.cheapshark.com/api/1.0/deals?upperPrice=0&sortBy=Recent&pageSize=60';
  const storesEndpoint =
    Deno.env.get('CHEAPSHARK_STORES_API_URL') ??
    'https://www.cheapshark.com/api/1.0/stores';
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'OpportunityRadar/1.0',
  };

  const [dealsResponse, storesResponse] = await Promise.all([
    fetch(endpoint, { headers }),
    fetch(storesEndpoint, { headers }),
  ]);

  if (!dealsResponse.ok) {
    throw new Error(`CheapShark API returned ${dealsResponse.status}`);
  }

  const deals = asArray(await dealsResponse.json());
  const stores = storesResponse.ok ? asArray(await storesResponse.json()) : [];
  const storeNames = new Map(
    stores.map((store) => [text(store.storeID), text(store.storeName, 'Game store')]),
  );

  return deals
    .filter((item) => Number(item.salePrice) === 0)
    .map((item, index) => {
      const storeID = text(item.storeID);
      const gameID = text(item.gameID, `game-${index}`);
      const dealID = text(item.dealID);
      const lastChange = Number(item.lastChange);
      const normalPrice = Number(item.normalPrice);
      const storeName = storeNames.get(storeID) ?? 'Game store';

      return {
        external_id: `${gameID}-${storeID}`,
        source: 'cheapshark',
        title: text(item.title, 'Free game deal'),
        organization: storeName,
        summary: `Δωρεάν προσφορά μέσω ${storeName}, εντοπισμένη από το CheapShark.`,
        url: dealID
          ? `https://www.cheapshark.com/redirect?dealID=${dealID}`
          : 'https://www.cheapshark.com/',
        image_url: text(item.thumb) || null,
        amount: Number.isFinite(normalPrice) && normalPrice > 0 ? normalPrice : null,
        currency: 'USD',
        deadline: null,
        tags: ['Free deal', storeName],
        status: 'active',
        published_at:
          Number.isFinite(lastChange) && lastChange > 0
            ? new Date(lastChange * 1000).toISOString()
            : new Date().toISOString(),
        raw_data: item,
      };
    });
}

function firstMetadata(
  metadata: Record<string, unknown>,
  key: string,
): string {
  const values = metadata[key];
  return Array.isArray(values) ? text(values[0]) : text(values);
}

function euFundingDeadline(metadata: Record<string, unknown>): string | null {
  const values = Array.isArray(metadata.deadlineDate)
    ? metadata.deadlineDate
    : [];
  const futureDates = values
    .map((value) => new Date(text(value)))
    .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() > Date.now())
    .sort((left, right) => left.getTime() - right.getTime());

  return futureDates[0]?.toISOString() ?? null;
}

function euFundingAmount(metadata: Record<string, unknown>): number | null {
  const raw = firstMetadata(metadata, 'budgetOverview');
  if (!raw) return null;

  try {
    const budget = JSON.parse(raw) as Record<string, unknown>;
    const topicMap = asRecord(budget.budgetTopicActionMap) ?? {};
    const amounts: number[] = [];

    for (const actions of Object.values(topicMap)) {
      if (!Array.isArray(actions)) continue;
      for (const action of actions) {
        const record = asRecord(action);
        if (!record) continue;
        const maximum = Number(record.maxContribution);
        if (Number.isFinite(maximum) && maximum > 0) amounts.push(maximum);
      }
    }

    return amounts.length > 0 ? Math.max(...amounts) : null;
  } catch {
    return null;
  }
}

function euFundingProgramme(identifier: string): string {
  if (identifier.startsWith('HORIZON')) return 'Horizon Europe';
  if (identifier.startsWith('ERASMUS')) return 'Erasmus+';
  if (identifier.startsWith('LIFE')) return 'LIFE';
  if (identifier.startsWith('DIGITAL')) return 'Digital Europe';
  if (identifier.startsWith('CERV')) return 'CERV';
  if (identifier.startsWith('CREA')) return 'Creative Europe';
  if (identifier.startsWith('EU4H')) return 'EU4Health';
  if (identifier.startsWith('ESC')) return 'European Solidarity Corps';
  return 'EU Funding & Tenders';
}

async function fetchEuFunding(): Promise<NormalizedOpportunity[]> {
  const endpoint =
    Deno.env.get('EU_FUNDING_API_URL') ??
    'https://api.tech.ec.europa.eu/search-api/prod/rest/search';
  const searchUrl = new URL(endpoint);
  searchUrl.searchParams.set('apiKey', 'SEDIA');
  searchUrl.searchParams.set('text', '***');
  // SEDIA results can contain very large HTML descriptions. Keep each response
  // bounded so the Edge Function can reliably read it in full.
  searchUrl.searchParams.set('pageSize', '5');
  searchUrl.searchParams.set('pageNumber', '1');

  const query = {
    bool: {
      must: [
        { terms: { type: ['1', '2', '8'] } },
        { terms: { status: ['31094501', '31094502'] } },
        { term: { programmePeriod: '2021 - 2027' } },
      ],
    },
  };
  const displayFields = [
    'type',
    'identifier',
    'reference',
    'callccm2Id',
    'title',
    'status',
    'caName',
    'startDate',
    'deadlineDate',
    'deadlineModel',
    'frameworkProgramme',
    'typesOfAction',
    'descriptionByte',
    'budgetOverview',
    'callTitle',
  ];
  const formParts: Record<string, unknown> = {
    sort: { order: 'ASC', field: 'deadlineDate' },
    query,
    languages: ['en'],
    displayFields,
  };
  const boundary = `opportunity-radar-${crypto.randomUUID()}`;
  const multipartBody = Object.entries(formParts)
    .map(
      ([key, value]) =>
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${key}"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${JSON.stringify(value)}\r\n`,
    )
    .join('') + `--${boundary}--\r\n`;
  const multipartBytes = new TextEncoder().encode(multipartBody);

  const response = await fetch(searchUrl, {
    method: 'POST',
    body: multipartBytes,
    headers: {
      Accept: 'application/json',
      'Content-Length': String(multipartBytes.byteLength),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Origin: 'https://ec.europa.eu',
      Referer: 'https://ec.europa.eu/',
      'User-Agent':
        'Mozilla/5.0 (compatible; OpportunityRadar/1.0; +https://supabase.com/)',
    },
  });

  if (!response.ok) {
    throw new Error(`EU Funding API returned ${response.status}`);
  }

  const payload = await response.json();
  const items = asArray(payload?.results);

  return items.flatMap((item, index) => {
    const metadata = asRecord(item.metadata) ?? {};
    const deadline = euFundingDeadline(metadata);
    if (!deadline) return [];

    const identifier = firstMetadata(metadata, 'identifier');
    const programme = euFundingProgramme(identifier);
    const title =
      firstMetadata(metadata, 'title') ||
      text(item.summary, 'EU funding opportunity');
    const typeOfAction = firstMetadata(metadata, 'typesOfAction');
    const startDate = firstMetadata(metadata, 'startDate');
    const externalId =
      identifier ||
      firstMetadata(metadata, 'REFERENCE') ||
      text(item.reference, `eu-funding-${index}`);
    const portalUrl = identifier
      ? `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(identifier)}`
      : firstMetadata(metadata, 'url') ||
        'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-search';

    return [{
      external_id: externalId,
      source: 'eufunding' as const,
      title,
      organization: programme,
      summary: plainText(firstMetadata(metadata, 'descriptionByte')),
      url: portalUrl,
      image_url: null,
      amount: euFundingAmount(metadata),
      currency: 'EUR',
      deadline,
      tags: ['EU Grant', programme, typeOfAction].filter(Boolean).slice(0, 5),
      status: 'active' as const,
      published_at: startDate
        ? new Date(startDate).toISOString()
        : new Date().toISOString(),
      raw_data: item,
    }];
  });
}

function localizedText(value: unknown): string {
  const record = asRecord(value);
  if (!record) return text(value);

  for (const language of ['eng', 'ell']) {
    const candidate = record[language];
    if (Array.isArray(candidate) && text(candidate[0])) return text(candidate[0]);
    if (text(candidate)) return text(candidate);
  }

  for (const candidate of Object.values(record)) {
    if (Array.isArray(candidate) && text(candidate[0])) return text(candidate[0]);
    if (text(candidate)) return text(candidate);
  }

  return '';
}

function firstArrayText(value: unknown): string {
  return Array.isArray(value) ? text(value[0]) : text(value);
}

function tedDeadline(item: Record<string, unknown>): string | null {
  const date = firstArrayText(item['deadline-receipt-tender-date-lot']);
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function fetchTedTenders(): Promise<NormalizedOpportunity[]> {
  const endpoint =
    Deno.env.get('TED_API_URL') ??
    'https://api.ted.europa.eu/v3/notices/search';
  const fields = [
    'publication-number',
    'publication-date',
    'notice-title',
    'buyer-name',
    'organisation-country-buyer',
    'classification-cpv',
    'deadline-receipt-tender-date-lot',
    'deadline-receipt-tender-time-lot',
    'estimated-value-proc',
    'estimated-value-cur-proc',
    'BT-24-Lot',
    'BT-21-Lot',
  ];
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:
        'publication-date >= today(-90) AND deadline-receipt-tender-date-lot >= today(0)',
      fields,
      page: 1,
      limit: 25,
      scope: 'ACTIVE',
      onlyLatestVersions: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`TED API returned ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const notices = asArray(payload?.notices);

  return notices.flatMap((item, index) => {
    const publicationNumber = text(
      item['publication-number'],
      `ted-${index}`,
    );
    const deadline = tedDeadline(item);
    if (!deadline) return [];

    const title =
      localizedText(item['notice-title']) ||
      localizedText(item['BT-21-Lot']) ||
      'European public tender';
    const buyer = localizedText(item['buyer-name']) || 'TED contracting authority';
    const description =
      localizedText(item['BT-24-Lot']) || localizedText(item['BT-21-Lot']);
    const country = firstArrayText(item['organisation-country-buyer']);
    const cpv = firstArrayText(item['classification-cpv']);
    const amount = Number(firstArrayText(item['estimated-value-proc']));
    const currency =
      firstArrayText(item['estimated-value-cur-proc']) || 'EUR';
    const publicationDate = text(item['publication-date']).slice(0, 10);
    const links = asRecord(item.links);
    const htmlLinks = asRecord(links?.html);
    const url =
      text(htmlLinks?.ENG) ||
      `https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(publicationNumber)}`;

    return [{
      external_id: publicationNumber,
      source: 'ted' as const,
      title,
      organization: buyer,
      summary: plainText(description),
      url,
      image_url: null,
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      currency,
      deadline,
      tags: ['EU Tender', country, cpv ? `CPV ${cpv}` : '']
        .filter(Boolean)
        .slice(0, 5),
      status: 'active' as const,
      published_at: publicationDate
        ? new Date(`${publicationDate}T00:00:00Z`).toISOString()
        : new Date().toISOString(),
      raw_data: item,
    }];
  });
}

function canonicalGiveawayTitle(value: unknown): string {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(
      /\((?:epic games(?: store)?|steam|gog|pc|mobile|android|ios|indiegala)[^)]*\)/g,
      ' ',
    )
    .replace(
      /(?:\s*[-:]\s*)?(?:free\s+)?(?:game\s+)?(?:steam\s+)?(?:key\s+)?giveaway$/g,
      ' ',
    )
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function deduplicateGiveaways(
  supabase: ReturnType<typeof createClient>,
): Promise<number> {
  const giveawaySources = ['epicgames', 'gamerpower', 'cheapshark', 'kingsumo'];
  const sourcePriority: Record<string, number> = {
    epicgames: 1,
    gamerpower: 2,
    cheapshark: 3,
    kingsumo: 4,
  };

  const { data, error } = await supabase
    .from('opportunities')
    .select('id, source, title, published_at')
    .eq('status', 'active')
    .in('source', giveawaySources);
  if (error) throw error;

  const groups = new Map<string, Record<string, unknown>[]>();

  for (const item of asArray(data)) {
    const key = canonicalGiveawayTitle(item.title);
    if (key.length < 4) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const duplicateIds: string[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    group.sort((left, right) => {
      const sourceDifference =
        (sourcePriority[text(left.source)] ?? 99) -
        (sourcePriority[text(right.source)] ?? 99);
      if (sourceDifference !== 0) return sourceDifference;
      return Date.parse(text(right.published_at)) - Date.parse(text(left.published_at));
    });

    duplicateIds.push(...group.slice(1).map((item) => text(item.id)).filter(Boolean));
  }

  if (duplicateIds.length > 0) {
    const { error: updateError } = await supabase
      .from('opportunities')
      .update({ status: 'closed' })
      .in('id', duplicateIds);
    if (updateError) throw updateError;
  }

  return duplicateIds.length;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json().catch(() => ({}));

    if (body.ingest_provider === 'eufunding' || body.ingest_provider === 'ted') {
      const providedToken = request.headers.get('X-EU-Ingest-Token');
      const expectedToken = Deno.env.get('EU_INGEST_TOKEN');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const providedBearer = authHeader.replace(/^Bearer\s+/i, '');
      const hasValidIngestToken = Boolean(
        expectedToken && providedToken === expectedToken,
      );
      const hasServiceRoleAuthorization = Boolean(
        serviceRoleKey && providedBearer === serviceRoleKey,
      );

      if (!hasValidIngestToken && !hasServiceRoleAuthorization) {
        return new Response(JSON.stringify({ error: 'Invalid ingest token' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const ingestProvider = body.ingest_provider as 'eufunding' | 'ted';
      const supplied = Array.isArray(body.opportunities)
        ? body.opportunities.slice(0, 100)
        : [];
      const opportunities = supplied.filter(
        (item: unknown) =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).source === ingestProvider,
      );
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { error: closeError } = await supabase
        .from('opportunities')
        .update({ status: 'closed' })
        .eq('source', ingestProvider)
        .eq('status', 'active');
      if (closeError) throw closeError;

      if (opportunities.length > 0) {
        const { error: upsertError } = await supabase
          .from('opportunities')
          .upsert(opportunities, { onConflict: 'source,external_id' });
        if (upsertError) throw upsertError;
      }

      return new Response(
        JSON.stringify({ imported: opportunities.length, providers: [ingestProvider] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const requested = Array.isArray(body.providers)
      ? (body.providers.filter((item: unknown) =>
          [
            'gamerpower',
            'epicgames',
            'freetogame',
            'cheapshark',
            'eufunding',
            'ted',
            'grants',
          ].includes(String(item)),
        ) as Provider[])
      : ([
          'gamerpower',
          'epicgames',
          'freetogame',
          'cheapshark',
          'eufunding',
          'ted',
          'grants',
        ] as Provider[]);

    const batches = await Promise.all(
      requested.map((provider) => {
        if (provider === 'grants') return fetchGrants();
        if (provider === 'epicgames') return fetchEpicGames();
        if (provider === 'freetogame') return fetchFreeToGame();
        if (provider === 'cheapshark') return fetchCheapShark();
        if (provider === 'eufunding') return fetchEuFunding();
        if (provider === 'ted') return fetchTedTenders();
        return fetchGamerPower();
      }),
    );
    const opportunities = batches.flat();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    for (const source of [
      'gamerpower',
      'epicgames',
      'freetogame',
      'cheapshark',
      'eufunding',
      'ted',
      'grants',
    ] as const) {
      if (!requested.includes(source)) continue;
      const { error } = await supabase
        .from('opportunities')
        .update({ status: 'closed' })
        .eq('source', source)
        .eq('status', 'active');
      if (error) throw error;
    }

    if (opportunities.length > 0) {
      const { error } = await supabase
        .from('opportunities')
        .upsert(opportunities, { onConflict: 'source,external_id' });
      if (error) throw error;
    }

    const deduplicated = await deduplicateGiveaways(supabase);

    return new Response(
      JSON.stringify({
        imported: opportunities.length,
        deduplicated,
        providers: requested,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null
              ? JSON.stringify(error)
              : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
