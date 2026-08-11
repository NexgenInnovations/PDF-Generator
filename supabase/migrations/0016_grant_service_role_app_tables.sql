-- server/src/db.ts now talks to these tables through the Data API
-- (PostgREST) via the service_role key, instead of a direct `pg` connection
-- as the `postgres` superuser. service_role bypasses RLS, but it does NOT
-- bypass ordinary table GRANTs the way a superuser connection does — so,
-- same as the service_role gap found and fixed for organizations/profiles/
-- invites in migration 0005, these 8 app tables need an explicit grant too.
-- No RLS is added here: these tables are still never queried by anon/
-- authenticated, only by the server's own service_role client.
grant select, insert, update, delete on
  public.pdf_templates,
  public.template_versions,
  public.filled_submissions,
  public.generated_pdfs,
  public.company_assets,
  public.letterheads,
  public.signature_events,
  public.waitlist_signups
to service_role;
