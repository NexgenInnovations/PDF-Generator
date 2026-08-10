create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid references organizations(id),
  role       text check (role in ('Admin', 'Designer', 'FormFiller')),
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),

  constraint org_and_role_together check (
    (org_id is null and role is null) or (org_id is not null and role is not null)
  )
);
