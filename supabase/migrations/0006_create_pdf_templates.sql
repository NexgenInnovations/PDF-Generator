create table pdf_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  current_version integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
