// Dev-only helper: creates (or reuses) a local Supabase test user and prints
// a real access token, so protected routes can be curl'd without going
// through the Google OAuth flow. Local Supabase only.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY (see `npx supabase status`).');
  process.exit(1);
}

const email = process.argv[2];
const password = 'test-password-123';
if (!email) {
  console.error('Usage: npx tsx server/scripts/mint-test-token.ts <email>');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anon = createClient(SUPABASE_URL, ANON_KEY);

const { data: existing } = await admin.auth.admin.listUsers();
const already = existing.users.find((u) => u.email === email);

if (!already) {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
}

const { data, error } = await anon.auth.signInWithPassword({ email, password });
if (error) throw error;

console.log(data.session?.access_token);
