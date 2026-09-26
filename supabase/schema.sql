-- Run in the SQL editor of a project in a FREE Supabase organization.
-- Ordinary Postgres table, policies, and trigger: no Edge Functions or add-ons.
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
