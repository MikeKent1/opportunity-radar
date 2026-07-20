import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
const anonKey = setting('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const serviceRoleKey = setting('SUPABASE_SERVICE_ROLE_KEY');
const projectRef = setting('SUPABASE_PROJECT_REF') ?? 'oqtqngqrelmszofoknqr';

if (!supabaseUrl || (!anonKey && !serviceRoleKey)) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL and either EXPO_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY',
  );
}

const rotateIngestToken = () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const isWindows = process.platform === 'win32';
  execFileSync(
    'npx',
    [
      'supabase',
      'secrets',
      'set',
      `EU_INGEST_TOKEN=${token}`,
      '--project-ref',
      projectRef,
    ],
    { stdio: 'inherit', shell: isWindows },
  );
  return token;
};

const ingestToken = serviceRoleKey ? undefined : setting('EU_INGEST_TOKEN') ?? rotateIngestToken();

const form = new FormData();
const fields = {
  sort: { order: 'ASC', field: 'deadlineDate' },
  query: {
    bool: {
      must: [
        { terms: { type: ['1', '2', '8'] } },
        { terms: { status: ['31094501', '31094502'] } },
        { term: { programmePeriod: '2021 - 2027' } },
      ],
    },
  },
  languages: ['en'],
  displayFields: [
    'identifier',
    'title',
    'status',
    'startDate',
    'deadlineDate',
    'typesOfAction',
    'descriptionByte',
    'budgetOverview',
  ],
};

for (const [key, value] of Object.entries(fields)) {
  form.append(key, new Blob([JSON.stringify(value)], { type: 'application/json' }));
}

const apiUrl =
  'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=100&pageNumber=1';
const apiResponse = await fetch(apiUrl, { method: 'POST', body: form });
if (!apiResponse.ok) throw new Error(`EU API returned ${apiResponse.status}`);

const payload = await apiResponse.json();
const now = Date.now();
const clean = (value = '') =>
  String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, ' - ')
    .replace(/&bull;/g, ' - ')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
const first = (metadata, key) =>
  Array.isArray(metadata?.[key]) ? String(metadata[key][0] ?? '') : '';
const programme = (identifier) => {
  if (identifier.startsWith('HORIZON')) return 'Horizon Europe';
  if (identifier.startsWith('ERASMUS')) return 'Erasmus+';
  if (identifier.startsWith('LIFE')) return 'LIFE';
  if (identifier.startsWith('DIGITAL')) return 'Digital Europe';
  if (identifier.startsWith('CERV')) return 'CERV';
  if (identifier.startsWith('EU4H')) return 'EU4Health';
  return 'EU Funding & Tenders';
};
const budgetAmount = (metadata) => {
  const raw = first(metadata, 'budgetOverview');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const amounts = Object.values(parsed.budgetTopicActionMap ?? {})
      .flat()
      .map((action) => Number(action?.maxContribution))
      .filter((amount) => Number.isFinite(amount) && amount > 0);
    return amounts.length ? Math.max(...amounts) : null;
  } catch {
    return null;
  }
};
const audienceTags = (metadata) => {
  const haystack = `${first(metadata, 'typesOfAction')} ${first(metadata, 'descriptionByte')}`.toLowerCase();
  const tags = new Set(['company', 'nonprofit']);
  if (/\b(sme|startup|start-up|entrepreneur)\b/i.test(haystack)) tags.add('startup');
  if (/\b(universit|research|academic|student|doctoral|phd)\b/i.test(haystack)) tags.add('student');
  return [...tags];
};

const normalized = (payload.results ?? []).flatMap((item) => {
  const metadata = item.metadata ?? {};
  const deadlines = (metadata.deadlineDate ?? [])
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()) && date.getTime() > now)
    .sort((a, b) => a - b);
  if (!deadlines.length) return [];

  const identifier = first(metadata, 'identifier');
  const sourceProgramme = programme(identifier);
  const startDate = new Date(first(metadata, 'startDate'));
  return [{
    external_id: identifier || String(item.reference),
    source: 'eufunding',
    title: first(metadata, 'title') || String(item.summary),
    organization: sourceProgramme,
    summary: clean(first(metadata, 'descriptionByte')),
    url: `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(identifier)}`,
    image_url: null,
    amount: budgetAmount(metadata),
    currency: 'EUR',
    deadline: deadlines[0].toISOString(),
    tags: ['EU Grant', sourceProgramme, first(metadata, 'typesOfAction')].filter(Boolean),
    eligible_regions: ['EU'],
    audience_tags: audienceTags(metadata),
    eligibility_flags: ['eu_programme'],
    status: 'active',
    published_at: Number.isFinite(startDate.getTime())
      ? startDate.toISOString()
      : new Date().toISOString(),
    raw_data: item,
  }];
});
const opportunities = [
  ...new Map(normalized.map((item) => [item.external_id, item])).values(),
];

if (serviceRoleKey) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error: closeError } = await supabase
    .from('opportunities')
    .update({ status: 'closed' })
    .eq('source', 'eufunding')
    .eq('status', 'active');
  if (closeError) throw closeError;

  if (opportunities.length > 0) {
    const { error: upsertError } = await supabase
      .from('opportunities')
      .upsert(opportunities, { onConflict: 'source,external_id' });
    if (upsertError) throw upsertError;
  }

  console.log(JSON.stringify({ imported: opportunities.length, providers: ['eufunding'] }));
} else {
  const ingestResponse = await fetch(`${supabaseUrl}/functions/v1/sync-opportunities`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      ...(ingestToken ? { 'X-EU-Ingest-Token': ingestToken } : {}),
    },
    body: JSON.stringify({ ingest_provider: 'eufunding', opportunities }),
  });

  const result = await ingestResponse.json();
  if (!ingestResponse.ok) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
}
