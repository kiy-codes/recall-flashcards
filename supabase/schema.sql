-- Run in the SQL editor of a project in a FREE Supabase organization.
-- Ordinary Postgres table, policies, and trigger: no Edge Functions or add-ons.
-- Provision AI administrators only from the trusted SQL editor, never the client:
-- insert into public.recall_ai_admins(user_id) values ('YOUR-AUTH-USER-UUID');
begin;

create table if not exists public.recall_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  library jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  revision integer not null default 1 check (revision > 0),
  constraint recall_library_shape check (
    jsonb_typeof(library) = 'object'
    and library ? 'sets' and jsonb_typeof(library -> 'sets') = 'array'
    and library ? 'folders' and jsonb_typeof(library -> 'folders') = 'array'
  ),
  -- Client limit is 2 MiB; allow for jsonb's added formatting whitespace.
  constraint recall_library_size check (octet_length(library::text) <= 4194304)
);

alter table public.recall_libraries enable row level security;
alter table public.recall_libraries force row level security;
revoke all on public.recall_libraries from public, anon, authenticated;
grant select, insert, update, delete on public.recall_libraries to authenticated;

drop policy if exists recall_select_own on public.recall_libraries;
create policy recall_select_own on public.recall_libraries
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists recall_insert_own on public.recall_libraries;
create policy recall_insert_own on public.recall_libraries
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists recall_update_own on public.recall_libraries;
create policy recall_update_own on public.recall_libraries
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists recall_delete_own on public.recall_libraries;
create policy recall_delete_own on public.recall_libraries
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.recall_stamp_library()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1;
  else
    NEW.revision := OLD.revision + 1;
  end if;
  NEW.updated_at := clock_timestamp();
  return NEW;
end;
$$;
revoke all on function public.recall_stamp_library() from public, anon, authenticated;
drop trigger if exists recall_library_revision on public.recall_libraries;
create trigger recall_library_revision before insert or update on public.recall_libraries
  for each row execute function public.recall_stamp_library();

commit;

-- Global AI selection. Membership is provisioned out of band by a database
-- administrator; clients cannot grant themselves this role.
begin;
create table if not exists public.recall_ai_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.recall_ai_admins enable row level security;
alter table public.recall_ai_admins force row level security;
revoke all on public.recall_ai_admins from public, anon, authenticated;
grant select on public.recall_ai_admins to authenticated;
drop policy if exists recall_ai_admin_self on public.recall_ai_admins;
create policy recall_ai_admin_self on public.recall_ai_admins
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.recall_ai_settings (
  id boolean primary key default true check (id),
  provider text not null default 'groq',
  model text not null default 'openai/gpt-oss-120b',
  constraint recall_ai_approved_model check (
    (provider = 'groq' and model in ('openai/gpt-oss-120b', 'openai/gpt-oss-20b')) or
    (provider = 'nvidia' and model in ('meta/llama-3.3-70b-instruct', 'meta/llama-3.1-8b-instruct')) or
    (provider = 'openai' and model in ('gpt-4.1-mini', 'gpt-4o-mini')) or
    (provider = 'gemini' and model in ('gemini-3.5-flash', 'gemini-3.5-flash-lite'))
  )
);
insert into public.recall_ai_settings(id, provider, model)
  values (true, 'groq', 'openai/gpt-oss-120b') on conflict (id) do nothing;
alter table public.recall_ai_settings enable row level security;
alter table public.recall_ai_settings force row level security;
revoke all on public.recall_ai_settings from public, anon, authenticated;
grant select on public.recall_ai_settings to authenticated;
grant update (provider, model) on public.recall_ai_settings to authenticated;
drop policy if exists recall_ai_settings_admin_select on public.recall_ai_settings;
create policy recall_ai_settings_admin_select on public.recall_ai_settings
  for select to authenticated using (exists (select 1 from public.recall_ai_admins where user_id = (select auth.uid())));
drop policy if exists recall_ai_settings_admin_update on public.recall_ai_settings;
create policy recall_ai_settings_admin_update on public.recall_ai_settings
  for update to authenticated using (exists (select 1 from public.recall_ai_admins where user_id = (select auth.uid())))
  with check (exists (select 1 from public.recall_ai_admins where user_id = (select auth.uid())));

create table if not exists public.recall_ai_provider_tests (
  provider text primary key check (provider in ('groq', 'nvidia', 'openai', 'gemini')),
  status text not null default 'not_tested' check (status in ('not_tested', 'working', 'failed')),
  last_successful_test_at timestamptz,
  last_tested_at timestamptz
);
insert into public.recall_ai_provider_tests(provider) values ('groq'), ('nvidia'), ('openai'), ('gemini')
  on conflict (provider) do nothing;
alter table public.recall_ai_provider_tests enable row level security;
alter table public.recall_ai_provider_tests force row level security;
revoke all on public.recall_ai_provider_tests from public, anon, authenticated;
grant select on public.recall_ai_provider_tests to authenticated;
drop policy if exists recall_ai_tests_admin_select on public.recall_ai_provider_tests;
create policy recall_ai_tests_admin_select on public.recall_ai_provider_tests
  for select to authenticated using (exists (select 1 from public.recall_ai_admins where user_id = (select auth.uid())));
commit;

-- Link shares are immutable snapshots of explicitly selected card content.
-- They are separate from whole-library backups and never contain progress,
-- due dates, review history, account details, card notes, or hints.
begin;

create or replace function public.recall_share_safe(deck jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare card jsonb; item jsonb;
begin
  if deck is null or jsonb_typeof(deck) is distinct from 'object' then return false; end if;
  if not (deck ?& array['name','subject','domain','language','tags','frontLabel','backLabel','cards'])
    or deck - array['name','subject','domain','language','tags','frontLabel','backLabel','cards'] <> '{}'::jsonb
    or jsonb_typeof(deck -> 'name') is distinct from 'string'
    or length(deck ->> 'name') not between 1 and 70
    or jsonb_typeof(deck -> 'subject') is distinct from 'string'
    or jsonb_typeof(deck -> 'domain') is distinct from 'string'
    or jsonb_typeof(deck -> 'frontLabel') is distinct from 'string'
    or jsonb_typeof(deck -> 'backLabel') is distinct from 'string'
    or jsonb_typeof(deck -> 'tags') is distinct from 'array'
    or jsonb_typeof(deck -> 'cards') is distinct from 'array'
    or octet_length(deck::text) > 1048576 then return false; end if;
  if jsonb_array_length(deck -> 'cards') > 2000 or jsonb_array_length(deck -> 'tags') > 30 then return false; end if;
  if jsonb_typeof(deck -> 'language') not in ('null', 'object') then return false; end if;
  if jsonb_typeof(deck -> 'language') = 'object' and (
    not ((deck -> 'language') ?& array['code','name'])
    or (deck -> 'language') - array['code','name'] <> '{}'::jsonb
    or jsonb_typeof(deck -> 'language' -> 'code') is distinct from 'string'
    or jsonb_typeof(deck -> 'language' -> 'name') is distinct from 'string') then return false; end if;
  for item in select value from jsonb_array_elements(deck -> 'tags') loop
    if jsonb_typeof(item) is distinct from 'string' or length(item #>> '{}') > 100 then return false; end if;
  end loop;
  for card in select value from jsonb_array_elements(deck -> 'cards') loop
    if jsonb_typeof(card) is distinct from 'object' then return false; end if;
    if not (card ?& array['front','back','acceptedAnswers','wordInfo'])
      or card - array['front','back','acceptedAnswers','wordInfo'] <> '{}'::jsonb
      or jsonb_typeof(card -> 'front') is distinct from 'string'
      or jsonb_typeof(card -> 'back') is distinct from 'string'
      or length(card ->> 'front') not between 1 and 700
      or length(card ->> 'back') not between 1 and 700
      or jsonb_typeof(card -> 'acceptedAnswers') is distinct from 'array'
      or jsonb_typeof(card -> 'wordInfo') is distinct from 'object' then return false; end if;
    if jsonb_array_length(card -> 'acceptedAnswers') > 30
      or not ((card -> 'wordInfo') ?& array['gender','originalMarker','partOfSpeech'])
      or (card -> 'wordInfo') - array['gender','originalMarker','partOfSpeech'] <> '{}'::jsonb
      or jsonb_typeof(card -> 'wordInfo' -> 'gender') is distinct from 'string'
      or jsonb_typeof(card -> 'wordInfo' -> 'originalMarker') not in ('string','null')
      or jsonb_typeof(card -> 'wordInfo' -> 'partOfSpeech') not in ('string','null') then return false; end if;
    for item in select value from jsonb_array_elements(card -> 'acceptedAnswers') loop
      if jsonb_typeof(item) is distinct from 'string' or length(item #>> '{}') > 100 then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function public.recall_share_safe(jsonb) from public, anon, authenticated;
grant execute on function public.recall_share_safe(jsonb) to authenticated;

create table if not exists public.recall_deck_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null check (length(deck_id) between 1 and 128),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  deck jsonb not null check (public.recall_share_safe(deck)),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint recall_share_expiry check (expires_at > created_at)
);
create index if not exists recall_deck_shares_owner on public.recall_deck_shares(owner_id, created_at desc);
alter table public.recall_deck_shares enable row level security;
alter table public.recall_deck_shares force row level security;
revoke all on public.recall_deck_shares from public, anon, authenticated;
grant select, insert, delete on public.recall_deck_shares to authenticated;
grant update(revoked_at) on public.recall_deck_shares to authenticated;

drop policy if exists recall_share_select_own on public.recall_deck_shares;
create policy recall_share_select_own on public.recall_deck_shares
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists recall_share_insert_own on public.recall_deck_shares;
create policy recall_share_insert_own on public.recall_deck_shares
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists recall_share_update_own on public.recall_deck_shares;
create policy recall_share_update_own on public.recall_deck_shares
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
drop policy if exists recall_share_delete_own on public.recall_deck_shares;
create policy recall_share_delete_own on public.recall_deck_shares
  for delete to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.recall_stamp_share_revocation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if OLD.revoked_at is not null then
    raise exception 'A revoked share link cannot be reactivated';
  end if;
  NEW.revoked_at := clock_timestamp();
  return NEW;
end;
$$;
revoke all on function public.recall_stamp_share_revocation() from public, anon, authenticated;
drop trigger if exists recall_share_revocation on public.recall_deck_shares;
create trigger recall_share_revocation before update on public.recall_deck_shares
  for each row execute function public.recall_stamp_share_revocation();

-- Bearer-token preview is the sole anonymous path. The token is hashed in the
-- browser before insertion and on the server at lookup; no table row or owner
-- identifier is returned. A revoked, expired, or deleted row returns null.
create or replace function public.recall_preview_deck_share(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  select deck into result from public.recall_deck_shares
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
      and revoked_at is null and expires_at > clock_timestamp()
    limit 1;
  return result;
end;
$$;
revoke all on function public.recall_preview_deck_share(text) from public, anon, authenticated;
grant execute on function public.recall_preview_deck_share(text) to anon, authenticated;

commit;

-- Uploads use conditional updates: WHERE user_id = auth.uid()
-- AND revision = the_revision_you_read AND updated_at = the_time_you_read.
-- Zero returned rows is a conflict; the client must fetch and ask again.
-- Do not replace this with an unconditional upsert.

-- Apply only after the existing Recall schema (including recall_ai_admins).
begin;

create or replace function public.recall_catalog_text(v jsonb, minimum integer, maximum integer, multiline boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'string' and length(btrim(v #>> '{}')) >= minimum
    and length(v #>> '{}') <= maximum and (v #>> '{}') !~ '[\x01-\x08\x0b\x0c\x0e-\x1f]'
    and (multiline or (v #>> '{}') !~ '[\r\n]'), false);
$$;
revoke all on function public.recall_catalog_text(jsonb,integer,integer,boolean) from public, anon, authenticated;

create or replace function public.recall_catalog_snapshot_valid(v jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare c jsonb; a jsonb; w jsonb; k text; n integer;
begin
  if jsonb_typeof(v) <> 'object' or octet_length(v::text) > 4194304 then return false; end if;
  if (select count(*) from jsonb_object_keys(v)) <> 16 or exists (select 1 from jsonb_object_keys(v) key
    where key not in ('id','file','cardCount','domain','language','tags','cards','title','description','qualification','examBoard','subject','topic','subtopic','version','verified')) then return false; end if;
  if not public.recall_catalog_text(v->'title',1,70) or not public.recall_catalog_text(v->'description',1,500)
    or not public.recall_catalog_text(v->'examBoard',1,80) or not public.recall_catalog_text(v->'subject',1,100)
    or not public.recall_catalog_text(v->'topic',1,120) or not public.recall_catalog_text(v->'subtopic',0,120)
    or not public.recall_catalog_text(v->'version',1,30) or (v->>'version') !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
    or jsonb_typeof(v->'qualification') <> 'string' or (v->>'qualification') not in ('GCSE','International GCSE') or jsonb_typeof(v->'verified') <> 'boolean'
    or jsonb_typeof(v->'id') <> 'string' or jsonb_typeof(v->'file') <> 'string' or jsonb_typeof(v->'domain') <> 'string'
    or (v->>'id') !~ '^web-[a-f0-9]{32}$' or v->>'file' <> 'content/flashcard-library/remote/' || (v->>'id') || '.csv'
    or v->>'domain' not in ('language','science','history','medicine','law','other') or v->'tags' <> '[]'::jsonb then return false; end if;
  if v->'language' <> 'null'::jsonb then
    w := v->'language';
    if v->>'domain' <> 'language' or jsonb_typeof(w) <> 'object' or (select count(*) from jsonb_object_keys(w)) <> 2
      or not public.recall_catalog_text(w->'code',1,20) or not public.recall_catalog_text(w->'name',1,100) then return false; end if;
  end if;
  if jsonb_typeof(v->'cards') <> 'array' then return false; end if;
  n := jsonb_array_length(v->'cards');
  if n not between 1 and 2000 or v->'cardCount' <> to_jsonb(n) then return false; end if;
  for c in select value from jsonb_array_elements(v->'cards') loop
    if jsonb_typeof(c) <> 'object' or (select count(*) from jsonb_object_keys(c)) <> 6
      or exists(select 1 from jsonb_object_keys(c) key where key not in ('front','back','notes','hint','acceptedAnswers','wordInfo'))
      or not public.recall_catalog_text(c->'front',1,700,true) or not public.recall_catalog_text(c->'back',1,700,true)
      or not public.recall_catalog_text(c->'notes',0,2000,true) or not public.recall_catalog_text(c->'hint',0,700,true)
      or jsonb_typeof(c->'acceptedAnswers') <> 'array' then return false; end if;
    if jsonb_array_length(c->'acceptedAnswers') > 30 then return false; end if;
    for a in select value from jsonb_array_elements(c->'acceptedAnswers') loop
      if not public.recall_catalog_text(a,1,100,true) then return false; end if;
    end loop;
    if (select count(*) <> count(distinct lower(value #>> '{}')) from jsonb_array_elements(c->'acceptedAnswers')) then return false; end if;
    w := c->'wordInfo';
    if jsonb_typeof(w) <> 'object' or (select count(*) from jsonb_object_keys(w)) <> 3
      or exists(select 1 from jsonb_object_keys(w) key where key not in ('gender','originalMarker','partOfSpeech'))
      or jsonb_typeof(w->'gender') <> 'string' or w->>'gender' not in ('masculine','feminine','neuter','common','unknown','not_applicable')
      or (w->'originalMarker' <> 'null'::jsonb and not public.recall_catalog_text(w->'originalMarker',0,80,true))
      or (w->'partOfSpeech' <> 'null'::jsonb and not public.recall_catalog_text(w->'partOfSpeech',0,100,true)) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.recall_catalog_snapshot_valid(jsonb) from public, anon, authenticated;

create table if not exists public.recall_catalog_decks (
  id text primary key check (id ~ '^web-[a-f0-9]{32}$'),
  snapshot jsonb not null check (public.recall_catalog_snapshot_valid(snapshot) and snapshot->>'id' = id),
  published boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  publisher_id uuid not null references auth.users(id),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  normalized_title text not null unique check (length(normalized_title) between 1 and 280),
  content_hash text not null unique check (content_hash ~ '^[a-f0-9]{64}$'),
  unique(publisher_id, idempotency_key)
);
alter table public.recall_catalog_decks enable row level security;
alter table public.recall_catalog_decks force row level security;
revoke all on public.recall_catalog_decks from public, anon, authenticated;
-- Column privileges ensure SELECT * cannot expose attribution or retry records.
grant select(id,snapshot) on public.recall_catalog_decks to anon, authenticated;
drop policy if exists recall_catalog_public_read on public.recall_catalog_decks;
create policy recall_catalog_public_read on public.recall_catalog_decks for select to anon, authenticated using (published = true);

create or replace function public.recall_catalog_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Published catalogue snapshots are immutable'; end;
$$;
revoke all on function public.recall_catalog_immutable() from public, anon, authenticated;
drop trigger if exists recall_catalog_immutable on public.recall_catalog_decks;
create trigger recall_catalog_immutable before update or delete on public.recall_catalog_decks
  for each row execute function public.recall_catalog_immutable();

create or replace function public.recall_publish_catalog(p_publisher uuid, p_key uuid, p_request_hash text, p_title text, p_content_hash text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.recall_catalog_decks; new_id text; clean jsonb;
begin
  if not exists (select 1 from public.recall_ai_admins where user_id = p_publisher) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  -- Serialize publication checks, including near-title matches and retry races.
  perform pg_advisory_xact_lock(721094820);
  select * into existing from public.recall_catalog_decks where publisher_id = p_publisher and idempotency_key = p_key;
  if found then
    if existing.request_hash <> p_request_hash then raise exception 'Retry key already used'; end if;
    return jsonb_build_object('id', existing.id, 'replayed', true);
  end if;
  if exists(select 1 from public.recall_catalog_decks where normalized_title = p_title or content_hash = p_content_hash
    or (least(length(normalized_title),length(p_title)) >= 12
      and least(length(normalized_title),length(p_title))::numeric / greatest(length(normalized_title),length(p_title)) >= 0.8
      and (strpos(normalized_title,p_title) > 0 or strpos(p_title,normalized_title) > 0))) then
    raise exception 'Likely duplicate title or matching content';
  end if;
  new_id := 'web-' || replace(gen_random_uuid()::text,'-','');
  clean := p_snapshot || jsonb_build_object('id',new_id,'file','content/flashcard-library/remote/' || new_id || '.csv');
  insert into public.recall_catalog_decks(id,snapshot,publisher_id,idempotency_key,request_hash,normalized_title,content_hash)
    values(new_id,clean,p_publisher,p_key,p_request_hash,p_title,p_content_hash);
  return jsonb_build_object('id',new_id,'replayed',false);
end;
$$;
revoke all on function public.recall_publish_catalog(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
-- Existing local SQL harnesses do not create this Supabase-managed role.
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.recall_catalog_decks from service_role';
    execute 'grant execute on function public.recall_publish_catalog(uuid,uuid,text,text,text,jsonb) to service_role';
  end if;
end $$;
commit;
