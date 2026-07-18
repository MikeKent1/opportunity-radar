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

function fallbackEnrichment(opportunity) {
  const summary = cleanText(opportunity?.summary || opportunity?.title).slice(0, 280);

  return {
    clean_summary: summary,
    prize_description: cleanText(opportunity?.title).slice(0, 160),
    eligibility: null,
    quality_score: 0.6,
    risk_flags: [],
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

function normalizeEnrichment(result, fallback) {
  const qualityScore = Number(result?.quality_score);
  return {
    clean_summary: text(result?.clean_summary).slice(0, 320) || fallback.clean_summary,
    prize_description: text(result?.prize_description).slice(0, 180) || fallback.prize_description,
    eligibility: text(result?.eligibility).slice(0, 160) || null,
    quality_score: Number.isFinite(qualityScore) ? Math.max(0, Math.min(1, qualityScore)) : fallback.quality_score,
    risk_flags: compactList(result?.risk_flags, 6),
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
          'Enrich giveaway listings for Prizen. Extract only facts supported by the provided text. Do not invent eligibility, dates, prize details, or entry requirements. Return valid JSON only.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Create concise, user-facing enrichment fields for a giveaway.',
          fields: {
            clean_summary: 'One or two plain-English sentences. Max 45 words.',
            prize_description: 'What the winner receives. Max 18 words.',
            eligibility: 'Eligibility/geography/age if explicitly stated, otherwise null.',
            quality_score: '0 to 1. Higher means clear prize, clear source, low scam/spam risk.',
            risk_flags:
              'Short flags for problems like unclear_prize, missing_rules, vague_deadline, engagement_bait, crypto_spam, suspicious_claims. Empty array if none.',
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
            quality_score: { type: 'number', minimum: 0, maximum: 1 },
            risk_flags: {
              type: 'array',
              items: { type: 'string' },
            },
            reason: { type: 'string' },
          },
          required: [
            'clean_summary',
            'prize_description',
            'eligibility',
            'quality_score',
            'risk_flags',
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
    return normalizeEnrichment(JSON.parse(content), fallback);
  } catch (error) {
    return {
      ...fallback,
      enrichment_method: 'rules_ai_failed',
      enrichment_reason: `Fallback enrichment used because AI failed: ${error.message}`,
    };
  }
}
