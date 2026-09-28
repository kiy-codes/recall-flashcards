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
