create table generated_pdfs (
  id               uuid primary key default gen_random_uuid(),
  submission_id    uuid not null references filled_submissions(id),
  template_id      uuid not null references pdf_templates(id),
  template_version integer not null,
  inputs_snapshot  text not null,
  schema_snapshot  text not null,
  file_path        text not null,
  file_size_bytes  bigint,
  generated_at     timestamptz not null default now()
);
