const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

function setting(key, env = {}) {
  const value = process.env[key] ?? env[key];
  return value && String(value).trim() ? String(value).trim() : undefined;
}

function cleanText(value) {
  return text(value)
    .replace(/<script[\s\S]*?(?:<\/script>|$)/gi, ' ')
    .replace(/<style[\s\S]*?(?:<\/style>|$)/gi, ' ')
    .replace(/<img\b[\s\S]*?(?:>|$)/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function compactList(values, limit = 10) {
  return [...new Set((values ?? []).map(text).filter(Boolean))].slice(0, limit);
}

const countryAliases = new Map([
  ['australia', 'AU'],
  ['austria', 'AT'],
  ['belgium', 'BE'],
  ['canada', 'CA'],
  ['finland', 'FI'],
  ['france', 'FR'],
  ['germany', 'DE'],
  ['greece', 'GR'],
  ['hellas', 'GR'],
  ['ireland', 'IE'],
  ['italy', 'IT'],
  ['netherlands', 'NL'],
  ['norway', 'NO'],
  ['spain', 'ES'],
  ['sweden', 'SE'],
  ['united kingdom', 'GB'],
  ['uk', 'GB'],
  ['great britain', 'GB'],
  ['united states', 'US'],
  ['united states of america', 'US'],
  ['usa', 'US'],
  ['u.s.', 'US'],
  ['u.s.a.', 'US'],
]);

const allowedAudienceTags = new Set([
  'individual',
  'student',
  'startup',
  'nonprofit',
  'company',
  'government',
  'tribal_organization',
  'research_institution',
  'developer',
]);

const allowedEligibilityFlags = new Set([
  'worldwide',
  'eu_programme',
  'us_federal_grant',
  'foreign_entities_excluded',
  'students_only',
  'nonprofits_only',
  'companies_only',
  'government_only',
  'tribal_organizations_only',
  'research_institutions_only',
  'public_procurement',
  'members_only',
  'employees_only',
  'invite_only',
  'age_restricted',
  'region_limited',
  'location_unclear',
  'eligibility_unclear',
]);

function normalizeCountryCode(value) {
  const raw = text(value);
  const normalized = lower(raw).replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (['worldwide', 'global', 'international'].includes(normalized)) return 'WORLDWIDE';
  if (/^[a-z]{2}$/i.test(raw)) return raw.toUpperCase();
  return countryAliases.get(normalized) ?? '';
}

function normalizeCountries(values) {
  return compactList(values, 16)
    .map(normalizeCountryCode)
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeRegions(values) {
  return compactList(values, 8)
    .map((value) => value.toUpperCase())
    .filter((value) => ['EU', 'EEA', 'WORLDWIDE'].includes(value))
    .slice(0, 4);
}

function normalizeAudience(values) {
  return compactList(values, 10)
    .map((value) => lower(value).replace(/[\s-]+/g, '_'))
    .filter((value) => allowedAudienceTags.has(value))
    .slice(0, 8);
}

function normalizeFlags(values) {
  return compactList(values, 12)
    .map((value) => lower(value).replace(/[\s-]+/g, '_'))
    .filter((value) => allowedEligibilityFlags.has(value))
    .slice(0, 10);
}

function isStrongTribalOnlySignal(opportunity, eligibility) {
  const title = lower(opportunity?.title);
  const textValue = lower(eligibility);
  return (
    /\btribal\b/.test(title) &&
    (
      /\beligible applicants are (?:federally recognized )?(?:indian tribes|tribes|tribal organizations)\b/.test(
        textValue,
      ) ||
      /\beligible applicants include (?:federally recognized )?(?:indian tribes|tribes|tribal organizations)\b/.test(
        textValue,
      ) ||
      /\bfederally recognized indian tribes and tribal organizations are eligible\b/.test(textValue)
    )
  );
}

function sanitizeRestrictiveFlags(flags, opportunity, eligibility) {
  const nextFlags = flags.filter((flag) => {
    if (flag !== 'tribal_organizations_only') return true;
    return isStrongTribalOnlySignal(opportunity, eligibility);
  });
  return compactList(nextFlags, 10);
}

function baselineSourceFlags(opportunity) {
  if (opportunity?.source === 'grants') return ['us_federal_grant'];
  if (opportunity?.source === 'eufunding') return ['eu_programme'];
  if (opportunity?.source === 'ted') return ['public_procurement'];
  if (opportunity?.source === 'kaggle') return ['worldwide'];
  return [];
}

function sourceDefaults(opportunity) {
  if (opportunity?.source === 'freetogame') {
    return {
      audience_tags: ['individual'],
    };
  }

  if (opportunity?.source === 'grants') {
    return {
      eligible_countries: ['US'],
      audience_tags: opportunity?.audience_tags?.length
        ? opportunity.audience_tags
        : ['nonprofit', 'company'],
      eligibility_flags: opportunity?.eligibility_flags?.length
        ? opportunity.eligibility_flags
        : ['us_federal_grant'],
    };
  }

  if (opportunity?.source === 'eufunding') {
    return {
      eligible_regions: ['EU'],
      audience_tags: opportunity?.audience_tags?.length
        ? opportunity.audience_tags
        : ['company', 'nonprofit'],
      eligibility_flags: ['eu_programme'],
    };
  }

  if (opportunity?.source === 'ted') {
    return {
      audience_tags: ['company'],
      eligibility_flags: ['public_procurement'],
    };
  }

  if (opportunity?.source === 'kaggle') {
    return {
      eligible_countries: ['WORLDWIDE'],
      eligible_regions: ['WORLDWIDE'],
      audience_tags: ['individual'],
      eligibility_flags: ['worldwide'],
    };
  }

  return {};
}

function isFreeToPlayGame(opportunity) {
  return opportunity?.source === 'freetogame';
}

function normalizeFreeToPlayGameEnrichment(enrichment, opportunity) {
  if (!isFreeToPlayGame(opportunity)) return enrichment;

  const tags = Array.isArray(opportunity?.tags) ? opportunity.tags.map(text).filter(Boolean) : [];
  const platform = tags.find((tag) => /pc|windows|browser|web/i.test(tag));
  const genre = tags.find((tag) => tag && tag !== platform);
  const summary = cleanText(enrichment.clean_summary || opportunity?.summary || opportunity?.title);
  const hasActionLink = Boolean(opportunity?.url);
  const hasImage = Boolean(opportunity?.image_url || opportunity?.raw_data?.thumbnail);
  const hasPlatform = Boolean(platform);
  const baseQuality = hasActionLink && hasImage && hasPlatform ? 0.72 : 0.66;
  const qualityScore = Math.max(Number(enrichment.quality_score) || 0, baseQuality);
  const qualityNotes = compactList(
    [
      ...(enrichment.quality_notes ?? []).filter(
        (note) => !['thin_listing', 'eligibility_unclear', 'value_unclear', 'location_unclear'].includes(lower(note)),
      ),
      'free_to_play_game',
      hasPlatform ? 'platform_listed' : '',
      hasActionLink ? 'official_source' : '',
    ],
    8,
  );

  return {
    ...enrichment,
    clean_summary:
      summary ||
      `${opportunity?.title ?? 'This game'} is a free-to-play game${genre ? ` in the ${genre} genre` : ''}${
        platform ? ` for ${platform}` : ''
      }.`,
    eligibility:
      'Free-to-play game listing. Availability can depend on the game platform, store, and local region.',
    audience_tags: normalizeAudience([...(enrichment.audience_tags ?? []), 'individual']),
    eligibility_flags: normalizeFlags(
      (enrichment.eligibility_flags ?? []).filter(
        (flag) => !['eligibility_unclear', 'location_unclear'].includes(lower(flag)),
      ),
    ),
    quality_score: Math.min(0.82, qualityScore),
    quality_notes: qualityNotes,
    enrichment_reason: 'FreeToGame listing normalized as a playable free-to-play game opportunity.',
  };
}

function fallbackEnrichment(opportunity) {
  const defaults = sourceDefaults(opportunity);
  const summary = cleanText(
    opportunity?.clean_summary ||
      opportunity?.summary ||
      opportunity?.raw_data?.summary?.summary_description ||
      opportunity?.title,
  ).slice(0, 320);

  return normalizeFreeToPlayGameEnrichment({
    clean_summary: summary,
    eligibility: opportunity?.eligibility ?? null,
    eligible_countries: normalizeCountries([
      ...(opportunity?.eligible_countries ?? []),
      ...(defaults.eligible_countries ?? []),
    ]),
    excluded_countries: normalizeCountries(opportunity?.excluded_countries ?? []),
    eligible_regions: normalizeRegions([
      ...(opportunity?.eligible_regions ?? []),
      ...(defaults.eligible_regions ?? []),
    ]),
    audience_tags: normalizeAudience([
      ...(opportunity?.audience_tags ?? []),
      ...(defaults.audience_tags ?? []),
    ]),
    eligibility_flags: normalizeFlags([
      ...(opportunity?.eligibility_flags ?? []),
      ...(defaults.eligibility_flags ?? []),
    ]),
    minimum_age: Number.isFinite(Number(opportunity?.minimum_age))
      ? Number(opportunity.minimum_age)
      : null,
    quality_score: Number.isFinite(Number(opportunity?.quality_score))
      ? Math.max(0, Math.min(1, Number(opportunity.quality_score)))
      : 0.65,
    quality_notes: compactList(opportunity?.quality_notes ?? [], 8),
    enrichment_method: 'rules',
    enrichment_reason: 'Rule fallback preserved source eligibility defaults.',
  }, opportunity);
}

function shouldUseAi(opportunity, env = {}) {
  if (!setting('OPENAI_API_KEY', env)) return false;
  if (lower(setting('AI_OPPORTUNITY_ELIGIBILITY_ENABLED', env) ?? 'true') === 'false') {
    return false;
  }
  return opportunity?.category !== 'giveaways';
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
  const minimumAge = Number(result?.minimum_age);
  const resultAudience = normalizeAudience(result?.audience_tags ?? []);
  const resultFlags = normalizeFlags(result?.eligibility_flags ?? []);
  const eligibility = text(result?.eligibility).slice(0, 320) || fallback.eligibility;
  const eligibleCountries = normalizeCountries([
    ...(fallback.eligible_countries ?? []),
    ...(result?.eligible_countries ?? []),
  ]);
  const eligibleRegions = normalizeRegions([
    ...(fallback.eligible_regions ?? []),
    ...(result?.eligible_regions ?? []),
  ]);

  return normalizeFreeToPlayGameEnrichment({
    clean_summary: cleanText(result?.clean_summary).slice(0, 320) || fallback.clean_summary,
    eligibility,
    eligible_countries: eligibleCountries,
    excluded_countries: normalizeCountries([
      ...(fallback.excluded_countries ?? []),
      ...(result?.excluded_countries ?? []),
    ]),
    eligible_regions: eligibleRegions,
    audience_tags: resultAudience.length ? resultAudience : fallback.audience_tags,
    eligibility_flags: sanitizeRestrictiveFlags(
      resultFlags.length
        ? normalizeFlags([...baselineSourceFlags(opportunity), ...resultFlags])
        : fallback.eligibility_flags,
      opportunity,
      eligibility,
    ),
    minimum_age: Number.isFinite(minimumAge)
      ? Math.max(0, Math.min(120, minimumAge))
      : fallback.minimum_age,
    quality_score: Number.isFinite(qualityScore)
      ? Math.max(0, Math.min(1, qualityScore))
      : fallback.quality_score,
    quality_notes: compactList([
      ...(fallback.quality_notes ?? []),
      ...(result?.quality_notes ?? []),
    ], 8),
    enrichment_method: 'ai_eligibility',
    enrichment_reason:
      text(result?.reason).slice(0, 300) ||
      'AI enriched general eligibility and quality fields.',
  }, opportunity);
}

export async function enrichOpportunityEligibilityWithAi(opportunity, options = {}) {
  const env = options.env ?? {};
  const fallback = fallbackEnrichment(opportunity);
  if (!shouldUseAi(opportunity, env)) return fallback;

  const apiKey = setting('OPENAI_API_KEY', env);
  const model =
    setting('OPENAI_ELIGIBILITY_MODEL', env) ??
    setting('OPENAI_ENRICHMENT_MODEL', env) ??
    setting('OPENAI_CLASSIFIER_MODEL', env) ??
    'gpt-5.4-mini';
  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'Enrich non-giveaway opportunity listings for Prizen. Extract only facts supported by the provided text. Do not invent eligibility, geography, applicant type, age limits, or quality concerns. Preserve source-level constraints such as US federal grants, EU funding, public tenders, and worldwide competitions when supported by the source. Return valid JSON only.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Create concise user-facing eligibility and quality metadata for this opportunity.',
          allowed_audience_tags: [...allowedAudienceTags],
          allowed_eligibility_flags: [...allowedEligibilityFlags],
          country_guidance:
            'Use ISO 3166-1 alpha-2 country codes. Use WORLDWIDE only when global participation is explicit or inherent to the source, such as Kaggle competitions. Use eligible_regions for EU/EEA programmes. Empty arrays mean unknown, not worldwide.',
          opportunity: {
            title: opportunity?.title,
            organization: opportunity?.organization,
            source: opportunity?.source,
            source_type: opportunity?.source_type,
            category: opportunity?.category,
            summary: cleanText(opportunity?.summary),
            clean_summary: cleanText(opportunity?.clean_summary),
            eligibility: cleanText(opportunity?.eligibility),
            amount: opportunity?.amount,
            currency: opportunity?.currency,
            deadline: opportunity?.deadline,
            tags: opportunity?.tags,
            existing_metadata: {
              eligible_countries: opportunity?.eligible_countries,
              excluded_countries: opportunity?.excluded_countries,
              eligible_regions: opportunity?.eligible_regions,
              audience_tags: opportunity?.audience_tags,
              eligibility_flags: opportunity?.eligibility_flags,
              minimum_age: opportunity?.minimum_age,
            },
            raw_data: opportunity?.raw_data,
          },
          output_fields: {
            clean_summary: 'One or two plain-English sentences. Max 45 words.',
            eligibility:
              'Plain-English eligibility/geography/applicant limits if known. Null only if truly unknown.',
            eligible_countries:
              'Countries that can participate/apply. Include source-implied countries, e.g. US federal grants are US.',
            excluded_countries: 'Countries explicitly excluded. Empty if none.',
            eligible_regions: 'Regions such as EU, EEA, WORLDWIDE. Empty if none.',
            audience_tags:
              'Who this is for: individual, student, startup, nonprofit, company, government, tribal_organization, research_institution, developer.',
            eligibility_flags:
              'Important limitations from the allowed flag list. Use *_only flags for strict applicant limits.',
            minimum_age: 'Integer minimum age if explicitly stated, otherwise null.',
            quality_score:
              '0 to 1. Raise for clear official source, deadline, eligibility, value, and action path. Lower for thin listings, unclear eligibility, poor text, vague value, or uncertain action path.',
            quality_notes:
              'Short internal notes like thin_listing, eligibility_unclear, value_unclear, official_source, clear_deadline.',
            reason: 'Short internal explanation.',
          },
        }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'opportunity_eligibility_enrichment',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            clean_summary: { type: 'string' },
            eligibility: { type: ['string', 'null'] },
            eligible_countries: { type: 'array', items: { type: 'string' } },
            excluded_countries: { type: 'array', items: { type: 'string' } },
            eligible_regions: { type: 'array', items: { type: 'string' } },
            audience_tags: { type: 'array', items: { type: 'string' } },
            eligibility_flags: { type: 'array', items: { type: 'string' } },
            minimum_age: { type: ['integer', 'null'] },
            quality_score: { type: 'number', minimum: 0, maximum: 1 },
            quality_notes: { type: 'array', items: { type: 'string' } },
            reason: { type: 'string' },
          },
          required: [
            'clean_summary',
            'eligibility',
            'eligible_countries',
            'excluded_countries',
            'eligible_regions',
            'audience_tags',
            'eligibility_flags',
            'minimum_age',
            'quality_score',
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
        enrichment_reason: `Rules fallback used because AI returned HTTP ${response.status}.`,
      };
    }

    const json = await response.json();
    const content = extractJsonFromResponse(json);
    return normalizeEnrichment(JSON.parse(content), fallback, opportunity);
  } catch (error) {
    return {
      ...fallback,
      enrichment_method: 'rules_ai_failed',
      enrichment_reason: `Rules fallback used because AI failed: ${error.message}`,
    };
  }
}
