# Optional accounts and cloud backup

Recall's Windows/Electron app and static website can use Supabase for email/password accounts and manual library snapshots. The existing `recall-library-v2` localStorage entry remains the working library. Study, editing, imports and exports work without signing in. No library is uploaded at sign-in or while typing. The separate Expo app is not connected by this change; its different data format must be reconciled before it can use this snapshot table.

## Free-plan assumptions and cost boundary

Checked against Supabase's official documentation on **23 September 2026**:

- The [Free plan](https://supabase.com/pricing) is $0/month and includes Postgres, password authentication, 50,000 monthly active users, 500 MB database space per project and 5 GB egress. There is a limit of two active free projects. Projects may pause after a week of inactivity. Managed downloadable database backups and point-in-time recovery are not included.
- The [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq) says exceeding free quotas results in notification and ultimately service restrictions. Paid organizations have different billing rules. **Use a project in an organization whose Billing page explicitly says Free.** A project URL/key does not reveal its plan, so the app cannot verify the organization’s billing status.
- This implementation requires no paid plan, add-on, usage purchase, subscription, external mail provider, custom domain, Edge Function, Storage bucket, Realtime subscription, social/SMS login, or AI service. The SQL trigger is an ordinary Postgres database trigger, not a billed Edge Function.
- No remote project, deployment, billing setting or release is created by installing/building/testing this code. Tests use fake accounts and an in-memory PostgreSQL engine. A hosted project is a manual setup step. If any dashboard step requests payment, an upgrade, an add-on, or a usage commitment, **stop**. Free quota exhaustion should be handled by reducing use or returning to local study.
- Vercel compatibility here means a static output configuration. Nothing deploys to Vercel or changes its billing. Review your existing hosting plan separately before deployment; a paid hosting account is outside this setup.

There is one cloud snapshot per account, not a cloud revision history. Each snapshot is limited by the client to 2 MiB. JSONB storage, indexes and other Supabase data also consume database space. Requests resend a whole library, so avoid repeated unnecessary uploads/downloads. Keep full backup files separately; a paused/deleted project or propagated deletion is not a substitute for a backup.

## Email confirmation limitation

Supabase's [default email sender](https://supabase.com/docs/guides/auth/auth-smtp) sends only to project-team addresses and currently permits two emails per hour. It is intended for testing. No external email provider is configured by this project.

For personal use with your project-team email, you can leave **Confirm email** enabled. Sign-up will ask you to follow the confirmation email and then sign in. Set a valid website Site URL in Authentication URL Configuration; the app does not consume authentication tokens from URL fragments or require an Electron deep link.

For email/password sign-ups using other addresses with no mail delivery service, manually disable **Confirm email** in the email provider settings. Supabase supports this [password-auth configuration](https://supabase.com/docs/guides/auth/passwords). Accounts then work immediately, but **email ownership is not verified**. Someone can register an address they do not own. This is a deliberate setup tradeoff, especially before making the site public. Password-reset email delivery is not included in this feature. The app handles confirmation-required and email-delivery errors clearly rather than adding a paid mail service.

## Dashboard setup

1. In Supabase, choose or create an organization on **Free**, then create a project within the available free-project limit. Verify the organization’s Billing page before continuing. Use its standard `https://PROJECT_REF.supabase.co` endpoint. Keep all paid add-ons off.
2. Open the SQL Editor and run [supabase/schema.sql](../supabase/schema.sql) in full. This creates `public.recall_libraries` with `user_id`, `library` JSONB, `updated_at`, and `revision`.
3. Verify Row Level Security is enabled. There are separate SELECT, INSERT, UPDATE and DELETE policies for `authenticated`, all comparing `auth.uid()` with `user_id`; UPDATE also checks the resulting owner. Anonymous clients have no table privileges. The primary key permits one row per account.
4. In Authentication, enable email/password. Choose the confirmation behavior described above. Leave phone/SMS, social login, anonymous sign-in and external providers unused.
5. Copy the project URL and **publishable key** from Connect or Settings → API Keys. A legacy **anon** key also works. Supabase identifies [publishable keys as suitable for distributed clients](https://supabase.com/docs/guides/getting-started/api-keys). Never copy a secret or `service_role` key. Builds reject elevated or unrecognized keys without printing them.
6. Configure the local build as below, open Account & sync, and sign up/sign in. No library moves automatically. Choose Upload local library and review the confirmation to create the first cloud row.
7. On another browser/computer using the same project configuration, sign in with the same account. Choose Download cloud library, compare the copies, and choose Use cloud. Existing local data gets a recovery copy before replacement.

## Environment and builds

Use Node **22.12 or later**. Copy [.env.example](../.env.example) to `.env.local` and enter only:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Alternatively, set `SUPABASE_ANON_KEY` to the legacy anon key and leave the publishable variable unset. Leave both URL and key unset to disable cloud features. `.env` and `.env.local` are ignored; `.env.example` contains placeholders. Process environment variables override files; `.env.local` overrides `.env`. Public keys and the URL necessarily become visible in the compiled app. Data protection depends on RLS and the user's authenticated session, not on hiding this key.

```powershell
npm install
npm start             # builds the local SDK bundle, then launches Electron
npm run build:web     # generates dist-web for static hosting
npm test
npm run test:smoke
```

The Supabase SDK is bundled locally by esbuild, so no CDN is needed. Electron keeps loading the same root `index.html`; its userData path and localStorage origin are unchanged. The existing installer scripts include the new files and build the client first. These instructions do not publish a release.

For an existing Vercel project, use the static configuration in [vercel.json](../vercel.json): framework Other, build command `npm run build:web`, output `dist-web`. Set the same two public variables in the intended Vercel environment. Source files, `.env` files, SQL, desktop executables and tests are excluded by an explicit build allowlist. Only `dist-web` should be served. A rebuild is needed after changing configuration. Do not serve the repository root as the public site.

The static site caches its application files after its first successful visit. It can reopen offline once the service worker finishes installing. Supabase/auth requests and user data are never put in the application-shell cache. Google Fonts remain an optional existing visual dependency, with fallback fonts offline. Browser storage eviction/clearing removes offline data; keep exports. The first visit to a new browser still needs a connection to download the site.

## Sync choices and conflict handling

Upload/download first reads the cloud row and previews counts, revision and cloud time. The dialog offers Keep local, Use cloud, Merge when safe and Cancel. It also lets you export the cloud snapshot before deciding.

| Action | Keep local | Use cloud | Merge when safe |
| --- | --- | --- | --- |
| Upload | Replace/create cloud with the reviewed local snapshot | Replace local with the reviewed cloud snapshot | Save a safe combined snapshot to both |
| Download | Skip download; change neither copy | Replace local with cloud | Combine locally; upload separately when ready |

Cancel changes neither library. Identical snapshots need no overwrite. Successful sync checks show a last-sync time for this project/account/device. That time records the operation, not a promise that later local edits have been uploaded.

Updates match both the revision and timestamp read at preview time. Postgres assigns every revision/time; the client never chooses them. A competing update or first insert raises a conflict. Downloads recheck cloud version before replacing local. Local edits after preview and account changes invalidate the preview as well. You must review again, rather than silently overwriting the newer copy. If a merged snapshot reaches cloud but a subsequent local write fails, the UI explicitly reports that partial result.

Sync history is stored separately in localStorage, scoped by project URL and account ID. It contains the last cloud snapshot for three-way comparison. Safe merges combine independent changes by stable IDs and respect unopposed deletions. Overlapping edits, delete-versus-edit conflicts, ambiguous review/activity totals, and invalid relationships disable merge. With no shared baseline, only unambiguous additions/equal records can be combined. During merge, this device retains its active deck, theme, keybinds and study options; Use cloud restores the full snapshot instead.

Before local replacement, the current library is written to `recall-library-before-cloud-v1`. Account & sync → Export previous local copy retrieves it. Each successful replacement refreshes this single recovery slot. If storage cannot hold the recovery copy and incoming library, replacement stops. Full-library exports contain the existing serialization, including schedules, deck metadata, sessions, tests and settings. They exclude passwords and account tokens. The existing deck imports/exports remain available.

Signing out uses the SDK’s local scope, affecting this device’s session rather than other signed-in computers. The library stays on the device. Anyone using that browser profile can see the local library after sign-out; use separate browser/OS profiles if required. Account changes never silently assign or download a library: the next sync still requires an explicit choice. Token persistence/refresh is handled by the Supabase SDK separately from the library.

## Verification and remaining manual checks

- Unit tests cover serialization, key rejection, validation, authentication errors, sign-out scope, separate-account metadata, safe/conflicting merges, concurrent writes, account/local changes during requests, malformed data, offline failure and storage failure.
- An in-memory PGlite/PostgreSQL test executes the actual SQL twice, supplies a local `auth.uid()` equivalent, and verifies all four policies across two users and the anonymous role, ownership changes, trigger revisions and stale writes. No hosted credentials are used.
- Smoke tests run with cloud disabled and an injected fake client in isolated Electron profiles. They exercise the real account UI on Electron files and the built HTTP website, including confirmation, error messages, overwrite choices, recovery, session restoration, reload and backup preview. The web test stops its HTTP server and reopens from the offline cache. Existing app interaction checks also run. External requests are blocked.

Manual hosted checks still needed after dashboard setup: sign up with your chosen confirmation setting, restore a session after closing/reopening, upload/download across two independent browsers, create an actual competing edit, and confirm two real accounts cannot read/update/delete each other’s rows. This validates the deployed project configuration and Supabase Auth delivery, which local tests cannot establish.

Dependency audit currently reports pre-existing findings in Electron 36 and its `extract-zip` dependency. The added Supabase client is not identified by that audit. Updating Electron across major versions is a separate compatibility change; no release is published here.

## Changed files

| Area | Files |
| --- | --- |
| Persistence and interface | `app.js`, `index.html`, `styles.css`, `account-ui.js` |
| Supabase and sync logic | `cloud-client-entry.js`, `sync-core.js`, `sync-service.js` |
| Database | `supabase/schema.sql` |
| Configuration and build | `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `scripts/build.js`, `vercel.json`, `web-offline.js` |
| Automated checks | `sync.test.js`, `sync-sql.test.js`, `sync-smoke-test.js`, `tests/sync-fixtures.js`, `scripts/run-smoke.js`, `smoke-test.js` |
| Documentation | `README.md`, `CHANGELOG.md`, `docs/CLOUD_SYNC.md` |

Verification on this workspace: `npm test` passed 56 tests, including PostgreSQL/RLS; `npm run test:smoke` passed the existing app checks and new Electron/static-web checks; the smoke runner built the static website; `git diff --check` passed. `npm audit --omit=dev` found no production dependency advisories. The complete audit still reports the existing Electron/extract-zip findings described above. Generated `cloud-client.js` and `dist-web/` are ignored outputs.
