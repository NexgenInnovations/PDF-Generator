-- pdf_templates, company_assets, and letterheads are per-organization
-- resources, but had no column recording which org owns a row. The only
-- access control on them was the requester's role (Admin/Designer), not
-- their org membership, so any org's Admin could read/write every other
-- org's templates, assets, and letterheads via the REST API. Add org_id so
-- server/src/db.ts can filter and insert by the caller's org.
--
-- Nullable rather than NOT NULL: a hosted project may already have rows
-- inserted before this migration, and there's no organization we can
-- correctly backfill them to. The application code always sets org_id on
-- insert going forward, and every read/update/delete filters on it, so a
-- legacy null-org_id row simply becomes invisible to every org (fails
-- closed) instead of blocking the migration.
alter table pdf_templates add column org_id uuid references organizations(id) on delete cascade;
alter table company_assets add column org_id uuid references organizations(id) on delete cascade;
alter table letterheads add column org_id uuid references organizations(id) on delete cascade;

create index idx_pdf_templates_org_id on pdf_templates(org_id);
create index idx_company_assets_org_id on company_assets(org_id);
create index idx_letterheads_org_id on letterheads(org_id);

-- template_versions has no org_id of its own (it's reached only through its
-- parent pdf_templates row), so publish_template_version must check
-- ownership itself instead of relying on a separate application-level check
-- before the RPC call — that would leave a TOCTOU gap between the check and
-- the atomic update below. Signature changes (new p_org_id parameter)
-- require dropping and recreating rather than CREATE OR REPLACE.
drop function if exists public.publish_template_version(uuid, text, text, text, text, text, integer);

create function public.publish_template_version(
  p_template_id uuid,
  p_org_id uuid,
  p_schema text,
  p_base_pdf text,
  p_schemas text,
  p_tag text,
  p_mode text,
  p_target_version integer default null
)
returns template_versions
language plpgsql
as $$
declare
  v_version integer;
  v_row template_versions;
begin
  if p_mode = 'new' then
    update pdf_templates
    set current_version = current_version + 1, updated_at = now()
    where id = p_template_id and org_id = p_org_id
    returning current_version into v_version;

    if not found then
      raise exception 'Template not found';
    end if;

    insert into template_versions (template_id, version, status, tag, schema, base_pdf, schemas)
    values (p_template_id, v_version, 'published', p_tag, p_schema, p_base_pdf, p_schemas)
    returning * into v_row;

    return v_row;
  elsif p_mode = 'replace' then
    update template_versions
    set tag = p_tag, schema = p_schema, base_pdf = p_base_pdf, schemas = p_schemas, created_at = now()
    where template_id = p_template_id
      and version = p_target_version
      and status = 'published'
      and exists (
        select 1 from pdf_templates pt
        where pt.id = p_template_id and pt.org_id = p_org_id
      )
    returning * into v_row;

    if not found then
      raise exception 'Published version not found';
    end if;

    return v_row;
  else
    raise exception 'Invalid mode: %', p_mode;
  end if;
end;
$$;

revoke execute on function public.publish_template_version from public, anon, authenticated;
grant execute on function public.publish_template_version to service_role;
