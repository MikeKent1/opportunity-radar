import { classifyRewardType, rewardSubcategories } from './reward-classifier.mjs';

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const allowedSubcategories = new Set(rewardSubcategories);
const generatedRewardTags = new Set([
  ...rewardSubcategories,
  'games',
  'gift cards',
  'in-game',
  'trips',
]);
const moneyAmountPattern = /(?:[$\u20AC\u00A3]\s?\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?|\b\d{2,}(?:[,.]\d{3})*(?:\.\d{2})?\s?(?:usd|eur|gbp|dollars?|euros?|pounds?)\b)/i;

function setting(key, env = {}) {
  const value = process.env[key] ?? env[key];
  return value && String(value).trim() ? String(value).trim() : undefined;
}

function buildText(opportunity) {
  const raw = opportunity?.raw_data && typeof opportunity.raw_data === 'object' ? opportunity.raw_data : {};
  const tags = Array.isArray(opportunity?.tags)
    ? opportunity.tags.filter((tag) => !generatedRewardTags.has(lower(tag)))
    : [];
  return [
    opportunity?.title,
    opportunity?.clean_summary ?? opportunity?.summary,
    opportunity?.organization,
    opportunity?.source,
    opportunity?.source_type,
    ...tags,
    raw.type,
    raw.worth,
    raw.instructions,
    raw.description,
    raw.details,
    raw.title,
  ].join(' ');
}

function cleanTags(tags) {
  return Array.isArray(tags)
    ? tags.filter((tag) => !generatedRewardTags.has(lower(tag)))
    : [];
}

function ruleConfidence(opportunity, subcategory) {
  const source = lower(opportunity?.source);
  const sourceType = lower(opportunity?.source_type);
  const haystack = lower(buildText(opportunity));

  if (['gamerpower', 'epicgames', 'cheapshark'].includes(source)) return 0.96;
  if (!['web', 'social'].includes(sourceType)) return 0.9;
  if (subcategory === 'other') return 0.58;
  if (moneyAmountPattern.test(haystack) && /\b(prizes?|prize pack|worth|valued at|value|setup|bundle)\b/i.test(haystack)) {
    return 0.62;
  }
  if (/\b(giveaway|sweepstakes?|contest)\b/i.test(haystack) && haystack.length < 120) return 0.68;

  return 0.82;
}

function shouldUseAi(opportunity, subcategory, confidence, env = {}) {
  if (!setting('OPENAI_API_KEY', env)) return false;
  if (lower(setting('AI_REWARD_CLASSIFIER_ENABLED', env) ?? 'true') === 'false') return false;

  const mode = lower(setting('AI_REWARD_CLASSIFIER_MODE', env) ?? 'uncertain');
  if (mode === 'all') return ['web', 'social'].includes(lower(opportunity?.source_type));

  return confidence < 0.75;
}

function fallbackClassification(opportunity, env = {}) {
  const subcategory = classifyRewardType(opportunity);
  const confidence = ruleConfidence(opportunity, subcategory);

  return {
    subcategory,
    classification_method: shouldUseAi(opportunity, subcategory, confidence, env)
      ? 'rules_ai_pending'
      : 'rules',
    classification_confidence: confidence,
    classification_reason:
      confidence < 0.75
        ? 'Rules matched an ambiguous giveaway; AI classification can refine this when OPENAI_API_KEY is configured.'
        : 'Rules classifier found a strong category signal.',
    needs_review: confidence < 0.65,
  };
}

function extractJsonFromResponse(payload) {
  const direct = payload?.choices?.[0]?.message?.content;
  if (direct) return direct;

  const outputText = payload?.output_text;
  if (outputText) return outputText;

  const content = payload?.output?.flatMap((item) => item?.content ?? []) ?? [];
  return content.find((item) => item?.type === 'output_text')?.text ?? '';
}

function normalizeAiResult(result, fallback) {
  const subcategory = allowedSubcategories.has(result?.subcategory) ? result.subcategory : fallback.subcategory;
  const confidence = Number(result?.confidence);
  const normalizedConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : fallback.classification_confidence;

  return {
    subcategory,
    classification_method: 'ai',
    classification_confidence: normalizedConfidence,
    classification_reason: text(result?.reason).slice(0, 300) || 'AI classified the giveaway reward type.',
    needs_review: normalizedConfidence < 0.72 || Boolean(result?.needs_review),
  };
}

export async function classifyRewardTypeWithAi(opportunity, options = {}) {
  const env = options.env ?? {};
  const fallback = fallbackClassification(opportunity, env);
  if (!shouldUseAi(opportunity, fallback.subcategory, fallback.classification_confidence, env)) {
    return fallback;
  }

  const apiKey = setting('OPENAI_API_KEY', env);
  const model = setting('OPENAI_CLASSIFIER_MODEL', env) ?? setting('AI_REWARD_CLASSIFIER_MODEL', env) ?? 'gpt-5.4-mini';
  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'Classify giveaway rewards for Prizen. Choose the category that describes what the winner actually receives. A money amount can be retail value, not cash. Return only valid JSON matching the schema.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          allowed_subcategories: rewardSubcategories,
          guidance: {
            cash: 'Cash payout, PayPal, Venmo, bank transfer, scholarship, stipend, prize money, or direct monetary reward.',
            gift_card: 'Gift card, voucher, store credit, prepaid card, or platform card.',
            trip: 'Travel, flights, hotel stays, vacations, cruises, resorts, getaways.',
            hardware: 'Physical products, electronics, gaming setup, furniture, vehicle, gear, prize pack of goods.',
            game: 'Full game or game key.',
            dlc: 'DLC, expansion, add-on.',
            in_game_item: 'Skins, items, currency, loot, cosmetics, weapons, mounts, packs inside a game.',
            software: 'Apps, SaaS, licenses, subscriptions, digital tools.',
            other: 'Unclear or none of the above.',
          },
          current_rules_guess: fallback.subcategory,
          opportunity: {
            title: opportunity?.title,
            clean_summary: opportunity?.clean_summary,
            prize_description: opportunity?.prize_description,
            eligibility: opportunity?.eligibility,
            summary: opportunity?.clean_summary ? undefined : opportunity?.summary,
            organization: opportunity?.organization,
            source: opportunity?.source,
            source_type: opportunity?.source_type,
            tags: cleanTags(opportunity?.tags),
          },
        }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'giveaway_reward_classification',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            subcategory: { type: 'string', enum: rewardSubcategories },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reason: { type: 'string' },
            needs_review: { type: 'boolean' },
          },
          required: ['subcategory', 'confidence', 'reason', 'needs_review'],
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
        classification_method: 'rules_ai_failed',
        classification_reason: `Rules fallback used because AI classifier returned HTTP ${response.status}.`,
      };
    }

    const json = await response.json();
    const content = extractJsonFromResponse(json);
    return normalizeAiResult(JSON.parse(content), fallback);
  } catch (error) {
    return {
      ...fallback,
      classification_method: 'rules_ai_failed',
      classification_reason: `Rules fallback used because AI classifier failed: ${error.message}`,
    };
  }
}
