-- filled_submissions had no record of who filled out the form, so admins
-- browsing the "Submissions" folder for a template couldn't tell whose PDF
-- was whose. Add submitter identity, captured on every /generate-pdf call.
--
-- Not null with a default rather than nullable: the API now requires
-- submitterName/submitterEmail on every submission going forward, but a
-- default keeps this migration from failing against pre-existing rows.
alter table filled_submissions
  add column submitter_name  text not null default '',
  add column submitter_email text not null default '';
