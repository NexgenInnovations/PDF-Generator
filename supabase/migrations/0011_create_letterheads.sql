create table letterheads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null default 'fields',
  static_schema text,
  page_width    double precision,
  page_height   double precision,
  base_pdf      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
