-- Grant table-level access to the API roles so PostgREST can reach these
-- tables at all; row-level security (below) then controls what each role
-- actually sees. Without this, the local Postgres instance's default
-- privilege ACL (owned by the `postgres` role that runs migrations here,
-- as opposed to `supabase_admin` on the hosted platform) only grants
-- anon/authenticated structural privileges (DELETE/TRIGGER/TRUNCATE/
-- REFERENCES), not SELECT/INSERT/UPDATE/DELETE, so requests fail with
-- "permission denied for table" before RLS is ever evaluated.
grant select, insert, update, delete on public.profiles, public.organizations, public.invites
  to anon, authenticated, service_role;

alter table profiles enable row level security;
alter table organizations enable row level security;
alter table invites enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);
