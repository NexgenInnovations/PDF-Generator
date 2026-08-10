create table filled_submissions (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references pdf_templates(id) on delete cascade,
  template_version integer not null,
  inputs           text not null,
  submitted_at     timestamptz not null default now()
);
