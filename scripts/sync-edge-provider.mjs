import fs from 'node:fs';

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

const provider = process.argv[2];
const allowedProviders = [
  'gamerpower',
  'epicgames',
  'freetogame',
  'cheapshark',
  'grants',
];

if (!allowedProviders.includes(provider)) {
  throw new Error(`Usage: node scripts/sync-edge-provider.mjs ${allowedProviders.join('|')}`);
}

const supabaseUrl = setting('EXPO_PUBLIC_SUPABASE_URL');
const anonKey = setting('EXPO_PUBLIC_SUPABASE_ANON_KEY');

if (!supabaseUrl || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

const response = await fetch(`${supabaseUrl}/functions/v1/sync-opportunities`, {
  method: 'POST',
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ providers: [provider] }),
});

const result = await response.json();
if (!response.ok) throw new Error(JSON.stringify(result));

console.log(
  JSON.stringify({
    imported: Number(result.imported ?? 0),
    deduplicated: Number(result.deduplicated ?? 0),
    providers: result.providers ?? [provider],
  }),
);
