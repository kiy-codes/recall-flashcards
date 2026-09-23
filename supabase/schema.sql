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

-- Uploads use conditional updates: WHERE user_id = auth.uid()
-- AND revision = the_revision_you_read AND updated_at = the_time_you_read.
-- Zero returned rows is a conflict; the client must fetch and ask again.
-- Do not replace this with an unconditional upsert.
