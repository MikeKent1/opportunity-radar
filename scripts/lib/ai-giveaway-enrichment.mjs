const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

function cleanText(value) {
  return text(value)
    .replace(/<script[\s\S]*?(?:<\/script>|$)/gi, ' ')
    .replace(/<style[\s\S]*?(?:<\/style>|$)/gi, ' ')
    .replace(/<img\b[\s\S]*?(?:>|$)/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(?:loading|decoding|width|height|src|class|alt|title|data-[\w-]+)=["'][^"']*["']/gi, ' ')
    .replace(/^\d{10}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function setting(key, env = {}) {
  const value = process.env[key] ?? env[key];
  return value && String(value).trim() ? String(value).trim() : undefined;
}

function compactList(values, limit = 8) {
  return [...new Set((values ?? []).map(text).filter(Boolean))].slice(0, limit);
}

const countryAliases = new Map([
  ['australia', 'AU'],
  ['canada', 'CA'],
  ['greece', 'GR'],
  ['hellas', 'GR'],
  ['united kingdom', 'GB'],
  ['uk', 'GB'],
  ['great britain', 'GB'],
  ['ireland', 'IE'],
  ['united states', 'US'],
  ['united states of america', 'US'],
  ['usa', 'US'],
  ['u.s.', 'US'],
  ['u.s.a.', 'US'],
]);

function normalizeCountryCode(value) {
  const normalized = lower(value).replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized === 'worldwide' || normalized === 'global' || normalized === 'international') {
    return 'WORLDWIDE';
  }
  if (/^[a-z]{2}$/i.test(text(value))) return text(value).toUpperCase();
  return countryAliases.get(normalized) ?? '';
}

function compactCountryList(values) {
  return compactList(values, 12)
    .map(normalizeCountryCode)
    .filter(Boolean)
    .slice(0, 8);
}

function buildSourceText(opportunity) {
  const raw = opportunity?.raw_data && typeof opportunity.raw_data === 'object' ? opportunity.raw_data : {};
  return cleanText([
    opportunity?.title,
    opportunity?.summary,
    raw.details,
    raw.detailPageText,
    raw.description,
  ].join(' '));
}

function detectLocalUse(textValue) {
  const value = lower(textValue);
  return (
    /\b(local businesses?|local partners?|local favourites?|local favorites?|specific location|pickup only|in-store only|local pickup)\b/i.test(
      value,
    ) ||
    /\b(unlimited monthly pass|monthly pass|class pass|classes?|water park passes?|venue passes?|admission tickets?|fitness pass|gift card to [a-z0-9 '&.-]+)\b/i.test(
      value,
    ) ||
    /\b(barrie|ontario|waikiki|honolulu)\b/i.test(value) &&
      /\b(location|local|pass|passes|classes?|tickets?|gift card)\b/i.test(value)
  );
}

function detectCountryCodes(textValue) {
  const value = lower(textValue);
  const countries = [];
  if (/\b(canada|ontario|barrie)\b/i.test(value)) countries.push('CA');
  if (/\b(united states|usa|u\.s\.|u\.s\.a\.|us residents?)\b/i.test(value)) countries.push('US');
  if (/\b(united kingdom|uk residents?|great britain)\b/i.test(value)) countries.push('GB');
  return [...new Set(countries)];
}

function detectLocalities(textValue) {
  const value = lower(textValue);
  const localities = [];
  if (/\bbarrie\b/i.test(value)) localities.push('Barrie, Ontario');
  if (/\bontario\b/i.test(value) && !localities.includes('Barrie, Ontario')) localities.push('Ontario');
  if (/\bhonolulu|waikiki\b/i.test(value)) localities.push('Honolulu, Hawaii');
  return localities;
}

function fallbackEnrichment(opportunity) {
  const summary = cleanText(opportunity?.summary || opportunity?.title).slice(0, 280);

  return {
    clean_summary: summary,
    prize_description: cleanText(opportunity?.title).slice(0, 160),
    eligibility: null,
    eligible_countries: [],
    localities: [],
    quality_score: 0.6,
    risk_flags: [],
    quality_notes: [],
    enrichment_method: 'rules',
    enrichment_reason: 'Fallback enrichment used the existing title and summary.',
  };
}

function shouldUseAi(opportunity, env = {}) {
  if (!setting('OPENAI_API_KEY', env)) return false;
  if (lower(setting('AI_GIVEAWAY_ENRICHMENT_ENABLED', env) ?? 'true') === 'false') return false;
  if (opportunity?.category !== 'giveaways') return false;
  return ['web', 'social'].includes(lower(opportunity?.source_type));
}

function extractJsonFromResponse(payload) {
  const direct = payload?.choices?.[0]?.message?.content;
  if (direct) return direct;

  const outputText = payload?.output_text;
  if (outputText) return outputText;

  const content = payload?.output?.flatMap((item) => item?.content ?? []) ?? [];
  return content.find((item) => item?.type === 'output_text')?.text ?? '';
}

function normalizeEnrichment(result, fallback, opportunity) {
  const qualityScore = Number(result?.quality_score);
  const nonRiskFlags = new Set([
    'missing_rules',
    'vague_deadline',
    'eligibility_not_stated',
    'thin_listing',
    'prize_value_unclear',
  ]);
  const rawRiskFlags = compactList(result?.risk_flags, 8);
  const rawQualityNotes = compactList(result?.quality_notes, 8);
  const sourceText = buildSourceText(opportunity);
  const localUse = detectLocalUse(sourceText);
  const riskFlags = rawRiskFlags.filter((flag) => !nonRiskFlags.has(flag));
  if (localUse && !riskFlags.includes('local_use_reward')) riskFlags.push('local_use_reward');
  const qualityNotes = compactList([
    ...rawQualityNotes,
    ...rawRiskFlags.filter((flag) => nonRiskFlags.has(flag)),
    ...(localUse ? ['local_details_unclear'] : []),
  ], 6);
  const eligibleCountries = compactCountryList([
    ...(result?.eligible_countries ?? []),
    ...detectCountryCodes(sourceText),
  ]);
  const localities = compactList([
    ...(result?.localities ?? []),
    ...detectLocalities(sourceText),
  ], 8).map((item) => item.slice(0, 80));
  const eligibility =
    text(result?.eligibility).slice(0, 160) ||
    (localUse
      ? `Local-use reward${localities.length ? ` in ${localities.slice(0, 2).join(', ')}` : ''}; formal eligibility is not stated.`
      : null);
  const normalizedQualityScore = Number.isFinite(qualityScore)
    ? Math.max(0, Math.min(1, qualityScore))
    : fallback.quality_score;

  return {
    clean_summary: text(result?.clean_summary).slice(0, 320) || fallback.clean_summary,
    prize_description: text(result?.prize_description).slice(0, 180) || fallback.prize_description,
    eligibility,
    eligible_countries: eligibleCountries,
    localities,
    quality_score: localUse ? Math.min(normalizedQualityScore, 0.55) : normalizedQualityScore,
    risk_flags: riskFlags.slice(0, 6),
    quality_notes: qualityNotes,
    enrichment_method: 'ai',
    enrichment_reason: text(result?.reason).slice(0, 300) || 'AI enriched the giveaway details.',
  };
}

export async function enrichGiveawayWithAi(opportunity, options = {}) {
  const env = options.env ?? {};
  const fallback = fallbackEnrichment(opportunity);
  if (!shouldUseAi(opportunity, env)) return fallback;

  const apiKey = setting('OPENAI_API_KEY', env);
  const model =
    setting('OPENAI_ENRICHMENT_MODEL', env) ??
    setting('OPENAI_CLASSIFIER_MODEL', env) ??
    'gpt-5.4-mini';
  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'Enrich giveaway listings for Prizen. Extract only facts supported by the provided text. Do not invent eligibility, dates, prize details, or entry requirements. Distinguish ordinary missing information from actual risk. Detect rewards that are only useful in a specific city, venue, branch, campus, or local service area. Return valid JSON only.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Create concise, user-facing enrichment fields for a giveaway.',
          fields: {
            clean_summary: 'One or two plain-English sentences. Max 45 words.',
            prize_description: 'What the winner receives. Max 18 words.',
            eligibility: 'Eligibility/geography/age if explicitly stated, otherwise null.',
            eligible_countries:
              'Array of ISO 3166-1 alpha-2 country codes explicitly eligible or strongly implied by local prize usability. Use WORLDWIDE only when worldwide/global/international entry is explicitly stated. Empty array when unknown.',
            localities:
              'Array of city/state/province/venue/service-area names for local-use prizes, pickup-only rewards, or region-specific rewards. Empty array when none.',
            quality_score:
              '0 to 1. Start around 0.70 for a valid but thin listing. Raise for clear prize/source/deadline/eligibility. Lower local-only/local-use rewards to around 0.35-0.55 unless the audience is clearly broad. Lower below 0.45 for unclear prize, suspicious claims, spam, unusable text, or rewards most users cannot use.',
            risk_flags:
              'Use only for actual user risk or serious uncertainty: unclear_prize, suspicious_claims, engagement_bait, crypto_spam, broken_text, misleading_value, unclear_entry_path, local_use_reward, region_limited. Use local_use_reward when the prize is local passes, local classes, local services, tickets, pickup-only goods, or a venue-specific reward that many users cannot use. Use region_limited when eligibility is explicitly restricted to a country/state/province/city. Do not use missing_rules or vague_deadline here unless the listing is otherwise suspicious.',
            quality_notes:
              'Non-risk limitations: missing_rules, vague_deadline, eligibility_not_stated, thin_listing, prize_value_unclear, local_details_unclear. Empty array if none.',
            reason: 'Short internal explanation.',
          },
          opportunity: {
            title: opportunity?.title,
            summary: cleanText(opportunity?.summary),
            organization: opportunity?.organization,
            source: opportunity?.source,
            source_type: opportunity?.source_type,
            subcategory: opportunity?.subcategory,
            tags: opportunity?.tags,
            deadline: opportunity?.deadline,
            raw_data: opportunity?.raw_data,
          },
        }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'giveaway_enrichment',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            clean_summary: { type: 'string' },
            prize_description: { type: 'string' },
            eligibility: { type: ['string', 'null'] },
            eligible_countries: {
              type: 'array',
              items: { type: 'string' },
            },
            localities: {
              type: 'array',
              items: { type: 'string' },
            },
            quality_score: { type: 'number', minimum: 0, maximum: 1 },
            risk_flags: {
              type: 'array',
              items: { type: 'string' },
            },
            quality_notes: {
              type: 'array',
              items: { type: 'string' },
            },
            reason: { type: 'string' },
          },
          required: [
            'clean_summary',
            'prize_description',
            'eligibility',
            'eligible_countries',
            'localities',
            'quality_score',
            'risk_flags',
            'quality_notes',
            'reason',
          ],
          additionalProperties: false,
        },
      },
    },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        ...fallback,
        enrichment_method: 'rules_ai_failed',
        enrichment_reason: `Fallback enrichment used because AI returned HTTP ${response.status}.`,
      };
    }

    const json = await response.json();
    const content = extractJsonFromResponse(json);
    return normalizeEnrichment(JSON.parse(content), fallback, opportunity);
  } catch (error) {
    return {
      ...fallback,
      enrichment_method: 'rules_ai_failed',
      enrichment_reason: `Fallback enrichment used because AI failed: ${error.message}`,
    };
  }
}
