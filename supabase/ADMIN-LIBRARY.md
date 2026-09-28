# Admin web library deployment

This feature is implemented locally only. Builds and tests do not migrate a hosted database, deploy a function, configure secrets, or publish real decks.

## Publishing and privacy

A signed-in member of `public.recall_ai_admins` opens **Settings → Admin web library**, selects a deck from their current personal library, reviews metadata, previews every card and completes a separate confirmation. Unsynchronised local decks can be selected; no cloud upload or sync is required. Creating, importing, editing, copying or synchronising a deck never publishes it.

Snapshots contain the nine publication metadata fields, deck domain/language, and card front, back, notes, hint, accepted answers and grammatical word information. Notes and hints become public too: review them carefully. Local IDs, tags, folders, flags, study state, history, scheduling, timestamps, sync information and publisher attribution are not exposed. Copies receive fresh local IDs and study progress. Later private edits never change the immutable public snapshot. There are no overwrite, delete or unpublish actions.

Final confirmation requires both checkboxes and typing the exact title. A publication receives one UUID retry key. After a lost response, retrying the same confirmation returns the original publication, not another row. Reusing a key for different content, matching card content regardless of order/case/punctuation, and likely duplicate titles are rejected. The server reserves the `web-` catalogue ID namespace.

Limits match catalogue validation: 1–2,000 cards; title 70, description 500, exam board 80, subject 100, topic/subtopic 120, version 30 characters; front/back/hint 700, notes 2,000; at most 30 accepted answers of 100 characters; grammatical marker 80 and part of speech 100. Requests are capped at 2 MiB UTF-8 including their envelope. Qualifications are exactly `GCSE` or `International GCSE`; versions use `major.minor.patch`, initially `1.0.0`. Empty/malformed and duplicate/near-duplicate cards are rejected independently by the server using the shared validator.

## Manual database migration

Use the **same Supabase project** configured in Recall's public client. Review and back up the project before applying SQL.

- Existing installation: in its trusted Dashboard SQL Editor, run all of `supabase/migrations/202609280001_public_catalog.sql`. The existing Recall schema, including `recall_ai_admins`, must already be installed.
- Fresh installation: run `supabase/schema.sql` instead; it includes this migration and all existing Recall tables/policies. The incremental migration alone is not a fresh-database bootstrap.

Alternatively, with the Supabase CLI installed, run from the project root:

```powershell
# Only if supabase/config.toml does not already exist:
supabase init

supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --linked --dry-run
# Review the pending migrations; do not apply unrelated changes.
supabase db push --linked
```

Choose SQL Editor OR CLI migration tracking. If the remote project has tracked migrations absent from this checkout, reconcile its history first instead of bypassing warnings or resetting the remote database. See [Supabase CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

The migration grants anonymous/authenticated clients only `SELECT(id,snapshot)` on successfully published rows. Publisher identity, creation time, hashes and retry records remain internal. Direct browser writes and execution of the publishing RPC are forbidden, including for administrators. Only `service_role` may execute the RPC; it rechecks administrator membership, serializes duplicate checks and inserts atomically. An immutability trigger blocks updates and deletes.

If the administrator is not already provisioned, replace the placeholder with an existing Auth user's UUID and run this **only in the trusted SQL Editor**:

```sql
insert into public.recall_ai_admins(user_id)
values ('YOUR-AUTH-USER-UUID')
on conflict (user_id) do nothing;
```

Never grant membership from a browser or use email-based authorization.

## Manual function and website deployment

Generate the browser mirror and bundled duplicate index, then deploy **only** the new function:

```powershell
npm run build:web
supabase functions deploy admin-library --project-ref YOUR_PROJECT_REF
```

Keep default platform JWT verification enabled. The handler also verifies the bearer token through `/auth/v1/user`, then checks `recall_ai_admins` using the user's JWT and RLS for every publication. Do not remove those checks. See [authenticated functions](https://supabase.com/docs/guides/functions/auth) and [function deployment](https://supabase.com/docs/guides/functions/deploy).

Supabase supplies `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. No new custom secrets or AI keys are required. Never place a service-role key in `.env.local`, Vercel build variables, generated JavaScript, Git or an installation package. Existing AI-provider functions/settings are unchanged.

The frontend uses only the existing public `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or legacy public `SUPABASE_ANON_KEY`). Serve/deploy **only `dist-web`**, using the existing website deployment process. This initial frontend deployment is required; subsequent deck publications appear when the public library is opened/refreshed without a website rebuild. All bundled decks remain available if cloud is unconfigured or unavailable.

## Verification and maintenance

```powershell
npm test
npm run test:smoke
npm run library:validate
npm run build:web
```

Tests use fake cloud services and local Postgres; they never publish to a hosted project. Before enabling production publication, inspect deployed grants/RLS and verify signed-out and ordinary accounts cannot use publishing, while an authorised administrator can reach the review workflow. Cancelling or closing confirmation must send no publication request. Only deliberately confirm a real deck when all its content is intended for public copying. A failed/unknown response instructs retrying the same confirmation, never silently overwriting content.

The canonical validator is `supabase/functions/_shared/catalog-core.js`; builds mirror it to `catalog-core.js`. `scripts/catalog.js` generates `_shared/catalog-bundled.json` from bundled public decks to prevent republishing bundled titles/content. Rebuild that index before future function deployments after bundled catalogue changes.
