insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', false)
on conflict (id) do nothing;

-- No storage policies needed: this bucket is only ever accessed via the
-- server's service_role Supabase client (server/src/routes/assets.ts),
-- which bypasses Storage RLS entirely — the same pattern used for the
-- app data tables (0006-0013), which have no RLS/grants either since
-- only the server's direct connection touches them.
