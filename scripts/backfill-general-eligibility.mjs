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
const serviceRoleKey = setting('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  console.log(
    JSON.stringify({
      providers: ['general-eligibility'],
      imported: 0,
      skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }),
  );
  process.exit(0);
}

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

const compact = (values) => [...new Set(values.filter(Boolean))];
const firstArrayValue = (value) => Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');

function tedCountry(opportunity) {
  const raw = opportunity.raw_data?.['organisation-country-buyer'] ?? opportunity.tags?.[1];
  const normalized = firstArrayValue(raw).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return countryAliases.get(normalized) ?? '';
}

function eufundingAudience(opportunity) {
  const haystack = `${opportunity.summary ?? ''} ${opportunity.tags?.join(' ') ?? ''}`.toLowerCase();
  const tags = new Set(['company', 'nonprofit']);
  if (/\b(sme|startup|start-up|entrepreneur)\b/i.test(haystack)) tags.add('startup');
  if (/\b(universit|research|academic|student|doctoral|phd)\b/i.test(haystack)) tags.add('student');
  return [...tags];
}

function grantsAudience(opportunity) {
  const applicantTypes = Array.isArray(opportunity.raw_data?.summary?.applicant_types)
    ? opportunity.raw_data.summary.applicant_types.join(' ')
    : '';
  const eligibility = opportunity.raw_data?.summary?.applicant_eligibility_description ?? '';
  const haystack = `${opportunity.summary ?? ''} ${opportunity.tags?.join(' ') ?? ''} ${applicantTypes} ${eligibility}`.toLowerCase();
  const tags = new Set();

  if (/native_american|tribal|indian tribes|tribal organizations/.test(haystack)) {
    tags.add('tribal_organization');
  }
  if (/nonprofit|community organizations|faith-based/.test(haystack)) tags.add('nonprofit');
  if (/small business|business|for-profit|commercial/.test(haystack)) tags.add('company');
  if (/state|county|city|township|municipal|government/.test(haystack)) tags.add('government');
  if (/higher education|university|school|student|academic/.test(haystack)) tags.add('student');

  return tags.size ? [...tags] : ['nonprofit', 'company'];
}

function isTribalOnlyGrant(opportunity) {
  const applicantTypes = Array.isArray(opportunity.raw_data?.summary?.applicant_types)
    ? opportunity.raw_data.summary.applicant_types.map((value) => String(value).toLowerCase())
    : [];
  const eligibility = String(opportunity.raw_data?.summary?.applicant_eligibility_description ?? '').toLowerCase();
  const hasOnlyTribalApplicantTypes =
    applicantTypes.length > 0 &&
    applicantTypes.every((value) => /native_american|tribal/.test(value));
  return (
    hasOnlyTribalApplicantTypes ||
    /\beligible applicants are indian tribes and tribal organizations\b/.test(eligibility)
  );
}

function grantsFlags(opportunity) {
  const eligibility = String(opportunity.raw_data?.summary?.applicant_eligibility_description ?? '').toLowerCase();
  const applicantTypes = Array.isArray(opportunity.raw_data?.summary?.applicant_types)
    ? opportunity.raw_data.summary.applicant_types.join(' ').toLowerCase()
    : '';
  const haystack = `${applicantTypes} ${eligibility}`;
  const flags = new Set(['us_federal_grant']);
  if (/\bforeign entities are not eligible\b/.test(haystack)) flags.add('foreign_entities_excluded');
  if (isTribalOnlyGrant(opportunity)) {
    flags.add('tribal_organizations_only');
  }
  return [...flags];
}

function eligibilityFor(opportunity) {
  if (opportunity.source === 'grants') {
    return {
      eligible_countries: ['US'],
      eligible_regions: [],
      audience_tags: grantsAudience(opportunity),
      eligibility_flags: grantsFlags(opportunity),
    };
  }

  if (opportunity.source === 'kaggle') {
    return {
      eligible_countries: ['WORLDWIDE'],
      eligible_regions: ['WORLDWIDE'],
      audience_tags: ['individual'],
      eligibility_flags: [],
    };
  }

  if (opportunity.source === 'eufunding') {
    return {
      eligible_regions: ['EU'],
      audience_tags: eufundingAudience(opportunity),
      eligibility_flags: ['eu_programme'],
    };
  }

  if (opportunity.source === 'ted') {
    const country = tedCountry(opportunity);
    return {
      eligible_countries: compact([country]),
      audience_tags: ['company'],
      eligibility_flags: ['public_procurement'],
    };
  }

  return null;
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const { data, error } = await supabase
  .from('opportunities')
  .select('id, source, summary, tags, raw_data')
  .eq('status', 'active')
  .in('source', ['grants', 'kaggle', 'eufunding', 'ted']);

if (error) throw error;

let updated = 0;
const counts = {};

for (const opportunity of data ?? []) {
  const values = eligibilityFor(opportunity);
  if (!values) continue;

  const { error: updateError } = await supabase
    .from('opportunities')
    .update(values)
    .eq('id', opportunity.id);
  if (updateError) throw updateError;

  updated += 1;
  counts[opportunity.source] = (counts[opportunity.source] ?? 0) + 1;
}

console.log(
  JSON.stringify({
    providers: ['general-eligibility'],
    imported: updated,
    counts,
  }),
);
