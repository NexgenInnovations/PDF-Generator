create table signature_events (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references filled_submissions(id),
  field_name    text not null,
  signer_name   text not null,
  signer_email  text not null,
  signed_at     timestamptz not null default now(),
  ip_address    text,
  document_hash text not null
);
