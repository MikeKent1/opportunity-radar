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
          return [line.slice(0, index).replace(/^\uFEFF/, ''), line.slice(index + 1)];
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
      imported: 0,
      closed: 0,
      providers: ['expired-cleanup'],
      skipped: 'Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    }),
  );
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const now = new Date().toISOString();

const { count, error } = await supabase
  .from('opportunities')
  .update({ status: 'closed', updated_at: now }, { count: 'exact' })
  .eq('status', 'active')
  .not('deadline', 'is', null)
  .lt('deadline', now);

if (error) {
  console.log(
    JSON.stringify({
      imported: 0,
      closed: 0,
      providers: ['expired-cleanup'],
      error: error.message,
    }),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    imported: 0,
    closed: count ?? 0,
    providers: ['expired-cleanup'],
    note: count ? `Closed ${count} expired active opportunities` : 'No expired active opportunities',
  }),
);
