-- Generated PDFs were never actually persisted (generated_pdfs.file_path
-- was a hardcoded placeholder string) — the bytes were streamed to whoever
-- filled the form and then discarded, so admins had nothing to browse or
-- download. Add a storage bucket for the PDF bytes, and org_id on the two
-- submission tables (same nullable, fails-closed pattern as 0017) so a
-- global "all submissions" admin view can be scoped per-org without joining
-- through pdf_templates on every query.
alter table filled_submissions add column org_id uuid references organizations(id) on delete cascade;
alter table generated_pdfs add column org_id uuid references organizations(id) on delete cascade;

create index idx_filled_submissions_org_id on filled_submissions(org_id);
create index idx_generated_pdfs_org_id on generated_pdfs(org_id);

insert into storage.buckets (id, name, public)
values ('filled-pdfs', 'filled-pdfs', false)
on conflict (id) do nothing;

-- No storage policies needed: this bucket is only ever accessed via the
-- server's service_role Supabase client, same as company-assets (0014).
