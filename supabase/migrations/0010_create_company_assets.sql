create table company_assets (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  file_path        text not null,
  mime_type        text not null,
  file_size_bytes  bigint not null,
  created_at       timestamptz not null default now()
);
