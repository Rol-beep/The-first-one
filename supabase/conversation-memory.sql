begin;

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

commit;
