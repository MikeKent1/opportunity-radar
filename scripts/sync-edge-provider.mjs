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
const maxAttempts = Number(setting('EDGE_SYNC_ATTEMPTS') ?? 3);

if (!supabaseUrl || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastFailure = null;
let successResult = null;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-opportunities`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ providers: [provider] }),
    });

    const result = await response.json().catch(async () => ({
      error: await response.text().catch(() => 'Unknown non-JSON response'),
    }));

    if (response.ok) {
      successResult = {
        imported: Number(result.imported ?? 0),
        deduplicated: Number(result.deduplicated ?? 0),
        providers: result.providers ?? [provider],
        attempts: attempt,
      };
      break;
    }

    lastFailure = {
      status: response.status,
      error: result.error ?? result.message ?? JSON.stringify(result),
      code: result.code,
      attempt,
    };
  } catch (error) {
    lastFailure = {
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      attempt,
    };
  }

  if (attempt < maxAttempts) {
    await sleep(1000 * attempt);
  }
}

if (successResult) {
  console.log(JSON.stringify(successResult));
} else {
console.log(
  JSON.stringify({
    imported: 0,
    deduplicated: 0,
    providers: [provider],
    error: lastFailure?.error ?? 'Unknown Edge Function error',
    code: lastFailure?.code,
    status: lastFailure?.status,
    attempts: maxAttempts,
  }),
);
  process.exitCode = 1;
}
