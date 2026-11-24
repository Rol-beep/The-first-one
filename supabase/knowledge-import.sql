begin;
set local search_path = public, extensions;

-- One lock protects imports/deletions. Entire version replacement is transactional.
create or replace function public.commit_knowledge_import(
  p_title text, p_chunks jsonb, p_backfill jsonb, p_expected jsonb
) returns void language plpgsql security invoker
set search_path = public, extensions
as $$
declare
  v_document public.documents%rowtype;
  v_item jsonb;
  v_embedding public.chunks.embedding%type;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('stan-naturalny-knowledge', 0));
  if nullif(btrim(p_title), '') is null or jsonb_array_length(p_chunks) = 0 then
    raise exception 'INVALID_IMPORT';
  end if;
  -- A confirmation authorizes exactly the versions seen by the user.
  select count(*) into v_count from public.documents where btrim(title) = btrim(p_title);
  if v_count <> jsonb_array_length(p_expected) or exists (
    select 1 from public.documents d where btrim(d.title) = btrim(p_title)
    and not exists (select 1 from jsonb_array_elements(p_expected) e
      where e->>'id' = d.id::text and (e->>'createdAt')::timestamptz = d.created_at)
  ) then raise exception 'KNOWLEDGE_VERSION_CONFLICT'; end if;

  for v_item in select value from jsonb_array_elements(p_backfill) loop
    v_embedding := (v_item->'embedding')::text::vector;
    update public.chunks set embedding = v_embedding
      where document_id::text = v_item->>'documentId'
        and chunk_index = (v_item->>'chunkIndex')::integer
        and content = v_item->>'content' and embedding is null;
    if not found and not exists (
      select 1 from public.chunks where document_id::text = v_item->>'documentId'
        and chunk_index = (v_item->>'chunkIndex')::integer
        and content = v_item->>'content' and embedding is not null
    ) then raise exception 'KNOWLEDGE_BACKFILL_CONFLICT'; end if;
  end loop;

  -- Delete the old version inside this transaction, so a failed INSERT rolls
  -- it back as well. This also works if title has a UNIQUE constraint.
  delete from public.chunks where document_id in (
    select id from public.documents where btrim(title) = btrim(p_title)
  );
  delete from public.documents where btrim(title) = btrim(p_title);

  insert into public.documents(title) values (btrim(p_title)) returning * into v_document;
  insert into public.chunks(document_id, chunk_index, content, embedding)
    select v_document.id, (e.ordinality - 1)::integer, e.value->>'content',
      (e.value->'embedding')::text::vector
    from jsonb_array_elements(p_chunks) with ordinality e(value, ordinality);

end;
$$;

create or replace function public.delete_knowledge_document(p_id text)
returns void language plpgsql security invoker
set search_path = public, extensions
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('stan-naturalny-knowledge', 0));
  delete from public.chunks where document_id::text = p_id;
  delete from public.documents where id::text = p_id;
end;
$$;

alter table public.documents enable row level security;
alter table public.chunks enable row level security;
-- These functions may only be called by the server's service_role.
revoke all on function public.commit_knowledge_import(text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.delete_knowledge_document(text) from public, anon, authenticated;
grant execute on function public.commit_knowledge_import(text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.delete_knowledge_document(text) to service_role;
grant usage on schema public to service_role;
grant all on public.documents, public.chunks to service_role;
grant usage, select on all sequences in schema public to service_role;
commit;
