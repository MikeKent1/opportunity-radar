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

const token = serviceRoleKey ? undefined : setting('EU_INGEST_TOKEN') ?? rotateIngestToken();

const fields = [
  'publication-number',
  'publication-date',
  'notice-title',
  'buyer-name',
  'organisation-country-buyer',
  'classification-cpv',
  'deadline-receipt-tender-date-lot',
  'estimated-value-proc',
  'estimated-value-cur-proc',
  'BT-24-Lot',
  'BT-21-Lot',
];
const apiResponse = await fetch('https://api.ted.europa.eu/v3/notices/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query:
      'publication-date >= today(-90) AND deadline-receipt-tender-date-lot >= today(0)',
    fields,
    page: 1,
    limit: 100,
    scope: 'ACTIVE',
    onlyLatestVersions: true,
  }),
});
if (!apiResponse.ok) throw new Error(`TED API returned ${apiResponse.status}`);

const payload = await apiResponse.json();
const text = (value) => String(value ?? '').trim();
const first = (value) => (Array.isArray(value) ? text(value[0]) : text(value));
const localized = (value) => {
  if (!value || typeof value !== 'object') return text(value);
  for (const language of ['eng', 'ell']) {
    const candidate = value[language];
    if (Array.isArray(candidate) && first(candidate)) return first(candidate);
    if (text(candidate)) return text(candidate);
  }
  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate) && first(candidate)) return first(candidate);
    if (text(candidate)) return text(candidate);
  }
  return '';
};
const countryAliases = new Map([
  ['AUT', 'AT'],
  ['BEL', 'BE'],
  ['BGR', 'BG'],
  ['HRV', 'HR'],
  ['CYP', 'CY'],
  ['CZE', 'CZ'],
  ['DNK', 'DK'],
  ['EST', 'EE'],
  ['FIN', 'FI'],
  ['FRA', 'FR'],
  ['DEU', 'DE'],
  ['GRC', 'GR'],
  ['HUN', 'HU'],
  ['IRL', 'IE'],
  ['ITA', 'IT'],
  ['LVA', 'LV'],
  ['LTU', 'LT'],
  ['LUX', 'LU'],
  ['MLT', 'MT'],
  ['NLD', 'NL'],
  ['NOR', 'NO'],
  ['POL', 'PL'],
  ['PRT', 'PT'],
  ['ROU', 'RO'],
  ['SVK', 'SK'],
  ['SVN', 'SI'],
  ['ESP', 'ES'],
  ['SWE', 'SE'],
]);
const countryCode = (value) => {
  const normalized = first(value).toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return countryAliases.get(normalized) ?? '';
};

const opportunities = (payload.notices ?? []).flatMap((item, index) => {
  const publicationNumber = text(item['publication-number']) || `ted-${index}`;
  const deadline = new Date(first(item['deadline-receipt-tender-date-lot']));
  if (!Number.isFinite(deadline.getTime())) return [];

  const amount = Number(first(item['estimated-value-proc']));
  const buyerCountry = countryCode(item['organisation-country-buyer']);
  const rawPublicationDate = text(item['publication-date']).slice(0, 10);
  const publicationDate = new Date(`${rawPublicationDate}T00:00:00Z`);
  const links = item.links?.html ?? {};
  return [{
    external_id: publicationNumber,
    source: 'ted',
    title:
      localized(item['notice-title']) ||
      localized(item['BT-21-Lot']) ||
      'European public tender',
    organization: localized(item['buyer-name']) || 'TED contracting authority',
    summary: localized(item['BT-24-Lot']) || localized(item['BT-21-Lot']),
    url:
      links.ENG ||
      `https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(publicationNumber)}`,
    image_url: null,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    currency: first(item['estimated-value-cur-proc']) || 'EUR',
    deadline: deadline.toISOString(),
    tags: [
      'EU Tender',
      first(item['organisation-country-buyer']),
      first(item['classification-cpv'])
        ? `CPV ${first(item['classification-cpv'])}`
        : '',
    ].filter(Boolean),
    eligible_countries: buyerCountry ? [buyerCountry] : [],
    audience_tags: ['company'],
    eligibility_flags: ['public_procurement'],
    status: 'active',
    published_at: Number.isFinite(publicationDate.getTime())
      ? publicationDate.toISOString()
      : new Date().toISOString(),
    raw_data: item,
  }];
});

if (serviceRoleKey) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error: closeError } = await supabase
    .from('opportunities')
    .update({ status: 'closed' })
    .eq('source', 'ted')
    .eq('status', 'active');
  if (closeError) throw closeError;

  if (opportunities.length > 0) {
    const { error: upsertError } = await supabase
      .from('opportunities')
      .upsert(opportunities, { onConflict: 'source,external_id' });
    if (upsertError) throw upsertError;
  }

  console.log(JSON.stringify({ imported: opportunities.length, providers: ['ted'] }));
} else {
  const ingestResponse = await fetch(`${supabaseUrl}/functions/v1/sync-opportunities`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      ...(token ? { 'X-EU-Ingest-Token': token } : {}),
    },
    body: JSON.stringify({ ingest_provider: 'ted', opportunities }),
  });
  const result = await ingestResponse.json();
  if (!ingestResponse.ok) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
}
