-- Atomic replacement for the two-statement transaction publishVersion()
-- used to run via a manually-managed pg client (BEGIN/COMMIT/ROLLBACK).
-- PostgREST can't span a transaction across two separate requests, so the
-- same atomicity now lives in this function instead: Postgres functions run
-- in an implicit transaction, so raising an exception rolls back everything
-- the function did, matching the old ROLLBACK-on-error behavior exactly.
create or replace function public.publish_template_version(
  p_template_id uuid,
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
    where id = p_template_id
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
    where template_id = p_template_id and version = p_target_version and status = 'published'
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

-- Postgres grants EXECUTE on new functions to PUBLIC by default (unlike
-- tables, which have no default grants) — lock that down explicitly so only
-- the server's service_role connection can call it, matching every other
-- app table's access model (server-only, never exposed to anon/authenticated).
revoke execute on function public.publish_template_version from public, anon, authenticated;
grant execute on function public.publish_template_version to service_role;
