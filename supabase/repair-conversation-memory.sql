begin;

-- Repair old, EMPTY tables created manually with numeric IDs.
-- No rows are deleted. Non-empty tables requiring conversion cause a rollback.
do $$
declare
  needs_conversion boolean;
  fk record;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'conversations' and column_name = 'id')
        or (table_name = 'messages' and column_name in ('id', 'conversation_id')))
      and udt_name <> 'uuid'
  ) into needs_conversion;
  if not needs_conversion then return; end if;

  if to_regclass('public.conversations') is not null then
    lock table public.conversations in access exclusive mode;
    if exists (select 1 from public.conversations) then
      raise exception 'Przerwano: conversations zawiera dane. Potrzebna migracja zachowujaca powiazania.';
    end if;
  end if;
  if to_regclass('public.messages') is not null then
    lock table public.messages in access exclusive mode;
    if exists (select 1 from public.messages) then
      raise exception 'Przerwano: messages zawiera dane. Potrzebna migracja zachowujaca powiazania.';
    end if;
  end if;

  -- Preserve original foreign key definitions and restore them after conversion.
  create temporary table memory_repair_fks (table_name text, constraint_name text, definition text) on commit drop;
  for fk in
    select conrelid::regclass::text as table_name, conname,
      pg_get_constraintdef(oid) as definition
    from pg_constraint
    where contype = 'f'
      and conrelid = to_regclass('public.messages')
      and confrelid = to_regclass('public.conversations')
  loop
    insert into memory_repair_fks values (fk.table_name, fk.conname, fk.definition);
    execute format('alter table %s drop constraint %I', fk.table_name, fk.conname);
  end loop;

  -- Other dependent tables are intentionally not modified; PostgreSQL will
  -- reject the type change and roll back the transaction if they depend on it.
  for fk in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'conversations' and column_name = 'id')
        or (table_name = 'messages' and column_name in ('id', 'conversation_id')))
      and udt_name <> 'uuid'
  loop
    execute format('alter table public.%I alter column %I drop identity if exists', fk.table_name, fk.column_name);
    execute format('alter table public.%I alter column %I drop default', fk.table_name, fk.column_name);
    execute format('alter table public.%I alter column %I type uuid using gen_random_uuid()', fk.table_name, fk.column_name);
  end loop;

  for fk in select * from memory_repair_fks loop
    execute format('alter table %s add constraint %I %s', fk.table_name, fk.constraint_name, fk.definition);
  end loop;
end $$;


create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null
);

-- Isolates conversations belonging to different password-login sessions.
-- Existing rows without an owner will not be exposed to a new session.
alter table public.conversations
  add column if not exists owner_key text;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null
);

-- A stable ordering independent of timestamp precision.
alter table public.messages
  add column if not exists position bigint generated always as identity;

create unique index if not exists messages_position_unique
  on public.messages(position);
create index if not exists messages_conversation_position
  on public.messages(conversation_id, position);
create index if not exists conversations_owner_created_at
  on public.conversations(owner_key, created_at desc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- No browser role can access either table.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('conversations', 'messages')
  loop
    execute format('drop policy %I on public.%I',
      policy_record.policyname, policy_record.tablename);
  end loop;
end $$;

revoke all on public.conversations, public.messages from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete
  on public.conversations, public.messages to service_role;

do $$
declare
  sequence_name text;
begin
  sequence_name := pg_get_serial_sequence('public.messages', 'position');
  if sequence_name is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', sequence_name);
    execute format('grant usage, select on sequence %s to service_role', sequence_name);
  end if;
end $$;


alter table public.conversations alter column id set default gen_random_uuid();
alter table public.messages alter column id set default gen_random_uuid();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where contype = 'f' and conrelid = 'public.messages'::regclass
      and confrelid = 'public.conversations'::regclass
      and conkey = array[(select attnum from pg_attribute
        where attrelid = 'public.messages'::regclass and attname = 'conversation_id')]::smallint[]
  ) then
    alter table public.messages add constraint messages_conversation_id_fkey
      foreign key (conversation_id) references public.conversations(id) on delete cascade;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'conversations' and column_name = 'id')
    or (table_name = 'messages' and column_name in ('id', 'conversation_id')))
order by table_name, column_name;
