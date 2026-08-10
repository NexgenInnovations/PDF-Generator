create table invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  role       text not null check (role in ('Admin', 'Designer', 'FormFiller')),
  code       text not null unique,
  created_by uuid not null references profiles(id),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_invites_code_unused on invites(code) where used_at is null;
