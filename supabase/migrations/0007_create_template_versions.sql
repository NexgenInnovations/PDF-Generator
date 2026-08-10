create table template_versions (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references pdf_templates(id) on delete cascade,
  version     integer not null,
  status      text not null default 'published',
  tag         text,
  schema      text not null,
  base_pdf    text not null,
  schemas     text not null,
  created_at  timestamptz not null default now(),
  constraint uq_template_version unique (template_id, version)
);

create unique index uq_template_versions_tag
  on template_versions (template_id, tag)
  where status = 'published';
