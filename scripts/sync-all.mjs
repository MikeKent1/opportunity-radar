import { spawn } from 'node:child_process';
import fs from 'node:fs';

const localEnv = fs.existsSync('.env')
  ? Object.fromEntries(
      fs
        .readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index).replace(/^\uFEFF/, ''), line.slice(index + 1)];
        }),
    )
  : {};
const mergedEnv = { ...localEnv, ...process.env };

const providers = [
  {
    id: 'gamerpower',
    label: 'GamerPower',
    script: 'scripts/sync-edge-provider.mjs',
    args: ['gamerpower'],
  },
  {
    id: 'epicgames',
    label: 'Epic Games',
    script: 'scripts/sync-edge-provider.mjs',
    args: ['epicgames'],
  },
  {
    id: 'freetogame',
    label: 'FreeToGame',
    script: 'scripts/sync-edge-provider.mjs',
    args: ['freetogame'],
  },
  {
    id: 'cheapshark',
    label: 'CheapShark',
    script: 'scripts/sync-edge-provider.mjs',
    args: ['cheapshark'],
  },
  {
    id: 'grants',
    label: 'Grants.gov',
    script: 'scripts/sync-edge-provider.mjs',
    args: ['grants'],
  },
  { id: 'eufunding', label: 'EU Funding', script: 'scripts/sync-eu-funding.mjs' },
  { id: 'ted', label: 'TED', script: 'scripts/sync-ted.mjs' },
  { id: 'producthunt', label: 'Product Hunt', script: 'scripts/sync-product-hunt.mjs' },
  { id: 'kaggle', label: 'Kaggle', script: 'scripts/sync-kaggle.mjs' },
  { id: 'rss', label: 'RSS feeds', script: 'scripts/sync-rss-feeds.mjs' },
  { id: 'sweepstakes-web', label: 'Sweepstakes web', script: 'scripts/sync-sweepstakes-web.mjs' },
  { id: 'reddit', label: 'Reddit', script: 'scripts/sync-reddit.mjs', optional: true },
  {
    id: 'apify-instagram',
    label: 'Apify Instagram',
    script: 'scripts/sync-apify-instagram.mjs',
    optional: true,
  },
  {
    id: 'expired-cleanup',
    label: 'Expired cleanup',
    script: 'scripts/close-expired-opportunities.mjs',
  },
  {
    id: 'reward-categorization',
    label: 'Reward categorization',
    script: 'scripts/backfill-giveaway-rewards.mjs',
  },
  {
    id: 'giveaway-enrichment',
    label: 'Giveaway enrichment',
    script: 'scripts/backfill-giveaway-enrichment.mjs',
    optional: true,
  },
];

const timeoutMs = Number(process.env.SYNC_PROVIDER_TIMEOUT_MS ?? 180_000);
const strict =
  process.env.SYNC_STRICT === '1' ||
  process.env.SYNC_STRICT === 'true' ||
  process.argv.includes('--strict');

const sensitiveValues = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'EU_INGEST_TOKEN',
  'PRODUCT_HUNT_API_KEY',
  'PRODUCT_HUNT_API_SECRET',
  'PRODUCT_HUNT_ACCESS_TOKEN',
  'KAGGLE_API_TOKEN',
  'REDDIT_CLIENT_ID',
  'REDDIT_CLIENT_SECRET',
  'APIFY_TOKEN',
  'INSTAGRAM_ACTOR_ID',
  'OPENAI_API_KEY',
]
  .map((key) => mergedEnv[key])
  .filter(Boolean);

const redact = (value) => {
  let output = String(value ?? '');
  for (const secret of sensitiveValues) {
    output = output.split(secret).join('[redacted]');
  }
  return output
    .replace(/EU_INGEST_TOKEN=[A-Za-z0-9_-]+/g, 'EU_INGEST_TOKEN=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/Basic\s+[A-Za-z0-9._~+/=-]+/gi, 'Basic [redacted]');
};

const runProvider = (provider) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [provider.script, ...(provider.args ?? [])], {
      env: mergedEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      const lastJsonLine = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .reverse()
        .find((line) => line.startsWith('{') && line.endsWith('}'));
      let payload = null;
      if (lastJsonLine) {
        try {
          payload = JSON.parse(lastJsonLine);
        } catch {
          payload = null;
        }
      }

      resolve({
        ...provider,
        ok: code === 0 && !timedOut,
        code,
        timedOut,
        durationMs,
        stdout: redact(stdout),
        stderr: redact(stderr),
        imported: Number(payload?.imported ?? 0),
        closed: Number(payload?.closed ?? 0),
        skipped: payload?.skipped ? String(payload.skipped) : '',
        note: payload?.note ? String(payload.note) : '',
        deduplicated: Number(payload?.deduplicated ?? 0),
        providerError: payload?.error ? String(payload.error) : '',
        attempts: Number(payload?.attempts ?? 1),
        error: timedOut
          ? `Timed out after ${timeoutMs}ms`
          : code === 0
            ? ''
            : redact(
                payload?.error
                  ? `${payload.code ? `${payload.code}: ` : ''}${payload.error}`
                  : stderr.trim() || stdout.trim() || `Exited with code ${code}`,
              ),
      });
    });
  });

const summaryRows = [];
console.log('Starting resilient scheduled sync...');

for (const provider of providers) {
  console.log(`\n--- ${provider.label} ---`);
  const result = await runProvider(provider);
  summaryRows.push(result);

  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.warn(result.stderr.trim());

  const icon = result.ok ? '✅' : provider.optional ? '⚠️' : '❌';
  console.log(
    `${icon} ${provider.label}: ${result.ok ? 'ok' : 'failed'} (${Math.round(
      result.durationMs / 1000,
    )}s, imported ${result.imported})`,
  );
}

const successes = summaryRows.filter((row) => row.ok);
const failures = summaryRows.filter((row) => !row.ok);
const blockingFailures = strict ? failures : [];

const markdown = [
  '## Scheduled sync summary',
  '',
  '| Provider | Status | Imported | Closed | Duration | Notes |',
  '| --- | --- | ---: | ---: | ---: | --- |',
  ...summaryRows.map((row) => {
    const status = row.ok ? '✅ OK' : row.optional ? '⚠️ Skipped/failed' : '❌ Failed';
    const notes = (row.skipped || row.error || row.note || '').replace(/\s+/g, ' ').slice(0, 180);
    const dedupeNote = row.deduplicated ? `Deduplicated ${row.deduplicated}. ` : '';
    const retryNote = row.attempts > 1 ? `Attempts ${row.attempts}. ` : '';
    return `| ${row.label} | ${status} | ${row.imported} | ${row.closed ?? 0} | ${Math.round(
      row.durationMs / 1000,
    )}s | ${dedupeNote}${retryNote}${notes} |`;
  }),
  '',
  `Successes: ${successes.length}/${summaryRows.length}`,
  `Failures: ${failures.length}/${summaryRows.length}`,
  strict ? 'Mode: strict' : 'Mode: resilient',
  '',
].join('\n');

console.log(`\n${markdown}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

if (successes.length === 0) {
  console.error('All providers failed.');
  process.exit(1);
}

if (blockingFailures.length > 0) {
  console.error(
    `Blocking provider failures: ${blockingFailures.map((row) => row.label).join(', ')}`,
  );
  process.exit(1);
}

process.exit(0);
