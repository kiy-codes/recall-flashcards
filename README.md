# Recall Flashcards

**v1.3.1 — Meaningful mastery**

Recall is a calm, local-first flashcard app for desktop and web. It is built with Electron and keeps decks, folders, cards, learning progress, session history, tests, and preferences on the device running the app.

## Features

- Create decks and organise them in coloured, collapsible folders.
- Add cards manually, paste text lists, or import CSV, TSV, and Recall share files.
- Use the three-stage import review to choose deck details, map word metadata, and check every card before importing.
- Customise the names of both card sides for every deck.
- Study with flip cards or typed answers, including forgiving answer matching.
- Use keyboard controls, shuffle, Due cards and other card filters, hints, flags, undo, fullscreen study, and custom keybinds.
- Review due cards daily with FSRS scheduling, four ratings, a configurable new-card limit, and a study streak.
- Track New, Learning, and Mastered card states, missed cards, streaks, session accuracy, and activity.
- Add tags, search cards, edit cards in bulk, detect duplicates, and export decks.
- Use Test Mode for typed, multiple-choice, or mixed assessments with time limits, saved results, review, retry, and history.
- Language decks with recognised gender data can also run article/gender tests (for example German `der` / `die` / `das`).
- Set a subject, domain, optional language, and deck tags in **Deck details**. Tags describe the whole deck; legacy per-card tags are migrated safely when you open the updated app.
- Add optional word details such as grammatical gender, source markers, part of speech, and accepted alternatives. Language decks can offer a gender quiz where the data supports it.
- Sort Library decks by Subject, name, card count, or manual order.
- Browse a small built-in flashcard library by qualification, exam board, subject and topic; preview and copy decks into your own editable collection.
- Choose light, dark, or system theme and set subject colours locally.
- Optionally sign in with a Supabase email/password account and manually upload or download a full-library cloud snapshot. Local study remains available offline; sync always asks before replacing data.

## Run locally

Install the project dependencies once:

```powershell
npm install
```

Start Recall in development mode:

```powershell
npm start
```

## Test

Run the unit tests for answer matching, Test Mode, subjects, deck logic, and the review scheduler:

```powershell
npm test
```

Run the Electron interaction smoke test:

```powershell
npm run test:smoke
```

## Built-in flashcard library and generator skill

Open **Library → Browse pre-made decks** to search or filter starter decks, preview cards, and choose **Copy to my decks**. This makes new card/deck IDs and fresh study progress in your local collection; editing or deleting that copy never changes the version-controlled original. The library works offline in Electron and in a cached web build. The two small example decks are marked **unverified samples**, not exam-board endorsements or complete syllabus coverage; their topics were checked against the [AQA GCSE Physics Waves specification](https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/specification/subject-content/waves) and [OCR A Level Biology A overview](https://www.ocr.org.uk/qualifications/as-and-alevel/biology-a-h020-h420-from-2015/specification-at-a-glance/). Three additional 50-card Edexcel International GCSE Chemistry decks cover **Gases in the Atmosphere**, **The Reactivity Series**, and **Solubility and Separation**. They follow the [Pearson Chemistry specification](https://qualifications.pearson.com/content/dam/pdf/International%20GCSE/Chemistry/2017/specification-and-sample-assessments/international-gcse-chemistry-2017-specification.pdf) topics supplied in the request, including acid rain. The third supplied section was labelled “kinetic theory,” but its listed objectives concern solubility and separation; the deck follows the listed objectives. These decks are also **unverified drafts** pending teacher review, not official Pearson material.

Source decks live as UTF-8 CSV under [`content/flashcard-library/`](content/flashcard-library/), with title, description, qualification, exam board, subject, topic/subtopic, version, verified flag, path and exact card count in [`index.json`](content/flashcard-library/index.json). The CSV header is Recall's actual 18-column **Export CSV** format; `catalog-core.js` validates it, and the existing exporter reads the same column list. Run `npm run library:validate` to check every deck. A new standalone CSV plus single metadata JSON object can be checked with `npm run library:validate -- --metadata entry.json --csv deck.csv`. Then place the CSV under `content/flashcard-library/`, add its entry to `index.json`, and run the full validator and build. Keep `verified` false until a human checks every card against the named specification. The build generates an ignored `catalog-data.js` from validated source files; only that static catalog data is packaged, with no backend or user data.

The canonical, model-agnostic generator instructions are in [`skills/recall-flashcards/SKILL.md`](skills/recall-flashcards/SKILL.md). Give that file to Claude or ChatGPT/Codex (or install its folder as a skill where your agent supports skills), then ask, for example, “Create 50 AQA GCSE Physics flashcards on Waves” or “Create a Recall library deck with 40 AQA GCSE Physics Waves cards.” The agent should write the CSV, plus a manifest entry for a library deck, and run the validator; it must not pad an unsupported topic merely to reach the requested count. [Official OpenAI documentation](https://developers.openai.com/plugins/concepts/skills) describes the shared `SKILL.md` workflow format used by ChatGPT/Codex. No OpenAI or Claude API connection is required by Recall itself for deck generation.

## Build local release artifacts

Run `npm ci` with Node 22.12 or later, then choose a command below. Packaging reads the current version from `package.json` and uses the existing `release-<version>` convention. These local build commands never commit, tag, push, create a GitHub release, publish or upload. Builder is always called with publishing disabled. Its first run may download free Electron/packaging tools into the normal local caches.

| Command | Artifacts | Required host |
| --- | --- | --- |
| `npm run dist` | Existing NSIS setup `.exe`, with installation-directory chooser and shortcuts | Windows |
| `npm run dist:win` | NSIS setup, portable `.exe`, ZIP, MSI | Windows |
| `npm run dist:win:portable` | Portable `.exe` (also `npm run dist:portable`) | Windows |
| `npm run dist:win:zip` | ZIP containing the unpacked application | Windows |
| `npm run dist:win:msi` | Unsigned MSI using Builder's free WiX toolchain | Windows |
| `npm run dist:linux` | AppImage, `.deb`, `.rpm`, `.tar.gz` | Linux, including WSL 2 |
| `npm run dist:mac` | Unsigned DMG and ZIP | macOS |
| `npm run dist:mac:pkg` | Unsigned PKG, explicit manual build only | macOS |
| `npm run dist:win:appx` | Unsigned AppX preview, explicit manual build only | Windows |
| `npm run dist:all-local` | All default formats for the current host | Windows, Linux or macOS |
| `npm run dist:release-folder` | Same as `dist:all-local` | Windows, Linux or macOS |
| `npm run dist:check` | Validate all platform config without building or downloading | Any |

`dist:all-local` and `dist:release-folder` build only the current OS, and exclude manual AppX/PKG. Foreign-platform commands fail before creating output. Windows builds Windows packages; Linux packages can be built in WSL 2 Ubuntu, a Linux VM/container, or native Linux. Install Node 22.12 or later and run `npm ci` inside a separate copy of the project on the Linux filesystem. Include the current release scripts and `package-lock.json`; exclude `.env.local`, Windows `node_modules`, and old releases. Then run `npm test` and `npm run dist:linux` inside Ubuntu, and copy the resulting artifacts back to the versioned release folder. Do not reuse Windows `node_modules`. Linux packaging needs the usual build utilities (including `rpm`/`rpm-build` for RPM; on Debian/Ubuntu, Electron Builder also documents `libopenjp2-tools`). macOS DMG and PKG require a Mac and Apple's local tools such as `hdiutil`, `pkgbuild` and `productbuild`. No Apple developer account is needed for these unsigned local packages. See [Electron Builder's host requirements](https://www.electron.build/v26/docs/features/multi-platform-build/).

For a public repository without a local Mac, `.github/workflows/macos-release-artifacts.yml` is a manual `workflow_dispatch` build on GitHub's standard Intel and Apple Silicon macOS runners. It uploads only unsigned installer/archive files as short-lived workflow artifacts; it does **not** create or update a GitHub Release. Download and verify them before copying to `release-<version>/github-upload/` or publishing them. A PKG attempt is optional and may fail without signing; DMG and ZIP remain the primary macOS outputs.

Architecture defaults to the machine's Node architecture. Append `-- --x64` or `-- --arm64` to choose one, for example `npm run dist:mac -- --arm64`. Windows MSI's current WiX toolchain uses an x64 installer wrapper for an ARM64 payload; x64 is the verified Windows configuration. Builds for other hosts/architectures still need testing there.

Output is isolated by platform, architecture and a unique build directory:

```text
release-1.3.0/
  windows/x64/build-<UTC-time>-<unique-id>/
    Recall-Flashcards-1.3.0-win-x64-setup.exe
    Recall-Flashcards-1.3.0-win-x64-portable.exe
    Recall-Flashcards-1.3.0-win-x64-zip.zip
    Recall-Flashcards-1.3.0-win-x64-msi.msi
    BUILD-NOTES.md
    .app/             (generated packaging input)
    win-unpacked/    (generated runnable application)
  linux/x64/build-<UTC-time>-<unique-id>/
  macos/arm64/build-<UTC-time>-<unique-id>/
```

The flat, Git-ignored `release-1.3.0/github-upload/` folder is the staging area for verified artifacts from each host. The Linux tar archive is named `Recall-Flashcards-1.3.0-linux-x64-archive.tar.gz` there; Electron Builder's original output has a redundant `.tar.gz` in its filename. Merely placing files in the folder does not upload anything.

Each invocation prints its exact output path and writes a build note with completion status and artifact paths. A failed build retains its partial output for inspection. Repeated builds always create a fresh directory: there is no release-folder cleanup or overwrite of previous artifacts or user files. Directory junctions/symlinks are rejected. Existing `release/`, `release-1.0.*`, and their installers are preserved. Release folders remain Git-ignored.

All packages are unsigned. Windows can show an unknown-publisher/SmartScreen warning, and macOS Gatekeeper may block an unnotarized app. Signing and notarization are **manual/future only**: Windows trusted certificates/services and Apple Developer ID/notarization are deliberately not configured. [AppX](https://www.electron.build/docs/appx/) is only an unsigned preview here: ordinary sideload installation needs an appropriate trusted signing certificate (a self-signed certificate can be free but requires explicit local trust setup). No certificate is generated or installed and no machine trust settings are changed. The placeholder AppX identity is for local experiments, not Store submission. Microsoft Store publishing is **manual/future only**. The installed Electron Builder 26.15.3 does not provide a native MSIX target, so MSIX is also **manual/future only**. [PKG signing](https://www.electron.build/docs/pkg/) would require a separate Developer ID Installer certificate; unsigned PKG generation does not.

### Release configuration and privacy

Release builds always compile a fresh client inside their own output directory with Supabase disabled. They never read `.env` or `.env.local`, never copy them into packages, and do not reuse or overwrite the generated development/web client. Only explicitly allowed application files and minimal package metadata are staged; dependencies used in the browser are bundled by esbuild. The existing `build:client`, `build:web`, `npm start` and Vercel configuration retain their current behavior.

To deliberately configure a cloud-enabled local release, supply `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or the legacy public `SUPABASE_ANON_KEY`) in the process environment and append `-- --with-cloud`, for example `npm run dist:win -- --with-cloud`. Both values become public in the package; secret/service-role keys are rejected. Even this opt-in does not load env files. Signing and publishing credentials are removed from the dedicated packaging process, and there are no publishing or output-path overrides in these scripts.

## Review scheduling

Home shows cards due today, new and learning cards, learned cards, reviews today, and your streak. Choose **Start Review** for all decks, a specific deck, or a topic present in deck metadata; **Deck cards → Start Review** starts that deck directly. A session shows the front first, then reveals the answer only when requested. Rate with **Again**, **Hard**, **Good**, or **Easy**; the buttons preview the next interval. Keyboard shortcuts are **Space** to reveal and **1–4** to rate. You can leave and resume a session without losing answered cards. The daily new-card limit defaults to **20** across all decks and can be changed on Home from 0 to 100.

In both regular study and Daily Review, a card becomes **Mastered** when a successful review earns a scheduled interval of at least **7 days**. A missed answer returns it to **Learning**, preserving its scheduling history so later successful reviews can restore mastery. Existing Mastered cards are reevaluated when loaded; cards without a stored interval of at least 7 days return to Learning without resetting their review history or due dates.

Scheduling uses [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) with FSRS 6 defaults, deterministic interval previews, 1-minute and 10-minute learning steps, and a 10-minute relearning step. Each user card stores `dueAt`, `lastReviewedAt`, `repetitions`, `lapses`, `schedulerVersion`, and an `fsrs` object containing FSRS state, stability, difficulty, learning step, and interval data. `reviewCount` and the local `reviewLog` remain in use; new review events also store the four-way rating and whether this was the card's first review. The saved `dailyReview` queue and `newCardLimit` are included in optional library sync. Dates are stored as UTC instants, while daily limits and streaks use the device's local calendar day.

Existing due dates, card content, counts, and review history are preserved. Cards without FSRS memory start their FSRS history on their next review while keeping their prior due date. Built-in library files are never scheduled directly; only the user's copied cards gain review data. The older Study and typed-answer flows still work: **Mark correct** maps to FSRS Good and **Needs practice** maps to Again.

## Subject tags and colours

Subject tags follow this form:

```text
Subject: Topic
```

Examples:

```text
Biology: Transpiration
German: Family vocabulary
Maths: Quadratics
```

Tags without a colon, such as `important` or `exam-question`, remain ordinary tags.

To apply tags to a whole deck:

1. Open the deck.
2. Go to **Deck cards**.
3. Select **Deck details**.
4. Add comma-separated deck tags and save.

All existing cards receive those tags, and future cards/imports inherit them. Choose the primary subject in the same dialog, then customise its accent in **Settings → Subject colours**.

## Data and privacy

Recall is local-first. It does not require an account or cloud connection. Your study data is saved in local browser storage on this computer. Optional Supabase accounts provide explicit upload/download of your complete library across browsers or computers. Account & sync includes full-library backup files and a recovery export before cloud replacements. Deck CSV, TSV and share exports remain available.

To add a card, open **Library**, choose a deck, then use **Add cards** on its **Deck cards** page. Saving returns to that deck. **Share deck** on the same page (or the share action beside a deck in Library) lets a signed-in owner create a private, expiring link or code and revoke it later. A recipient can use **Library → Shared with me** to preview it and choose **Copy to my library** for an independent local copy. The owner’s account details, private notes, hints, due dates and review history are not in the share snapshot. Existing local `.recall` share-file exports now use the same private-field-safe snapshot. A recipient’s already imported copy cannot be recalled by revoking a link. See [the sharing setup and limitations](docs/CLOUD_SYNC.md#private-deck-sharing).

See [Optional accounts and cloud backup](docs/CLOUD_SYNC.md) for the verified free-plan assumptions, email confirmation limitations, dashboard steps, SQL policies, environment configuration, and conflict choices. Cloud features are disabled until the two public Supabase configuration values are supplied. Sync and sharing require no paid service; optional AI may incur provider usage costs, so review current limits before configuring it.

For a static Vercel-compatible build, run `npm run build:web` and serve only `dist-web`. Node 22.12 or later is required. Electron continues to start with `npm start`. The static site can reopen offline after its first visit finishes caching.

### Optional AI answer evaluation

In **Settings → Answer evaluation**, AI appeals are off by default. Typed study and Test Mode answers are always graded locally first using exact matching, accepted alternatives, and typo tolerance. A non-correct result then shows **Appeal with AI**; clicking it enables appeals and sends that one answer to the `evaluate-answer` Supabase Edge Function. Each later answer still needs its own click. No provider request is made merely by submitting an answer. If cloud setup, sign-in, or the server function is missing, the reason appears beside the original local result. The default is Groq `openai/gpt-oss-120b`; the selected provider judges meaning, scientific key concepts, contradictions, and language-specific spelling. An accepted appeal counts as correct; a partial appeal earns fractional Test Mode and study-session credit but is scheduled as needs-practice rather than receiving a correct-answer interval; a rejected or unavailable appeal keeps the local grade. Multiple-choice/gender answers cannot be appealed. Each submitted answer can be appealed once, and the server permits ten AI reviews per signed-in user per hour per running function instance.

To enable it, apply [`supabase/schema.sql`](supabase/schema.sql) to the **same Supabase project** used by the app, then deploy both [`evaluate-answer`](supabase/functions/evaluate-answer/index.ts) and [`admin-ai`](supabase/functions/admin-ai/index.ts) Edge Functions. The default selection is Groq `openai/gpt-oss-120b`. Add provider keys **only** in Supabase Edge Function secrets: `GROQ_API_KEY`, `NVIDIA_API_KEY`, `OPENAI_API_KEY`, and/or `GEMINI_API_KEY`. `GROQ_MODEL` is optional for a legacy installation with no settings row; it defaults to `openai/gpt-oss-120b` and must be an approved Groq model. Do not put any provider key in `.env.local`, Vercel build variables, Git, or desktop packages. Supabase supplies `SUPABASE_SERVICE_ROLE_KEY` privately to the Edge Functions; it reads the selected model and writes server-verified test status, and is never bundled or returned. Nothing in this repository deploys functions or configures live keys automatically.

AI administrators are provisioned only through a trusted Supabase SQL editor or equivalent privileged migration: `insert into public.recall_ai_admins(user_id) values ('AUTH-USER-UUID');`. The UUID must be an existing authenticated user's ID. There is no email-based or frontend-only admin check. When that user signs in, **Settings → Admin AI providers** shows the global selection, approved models, each provider's key-configured flag, test status, and last successful test time. “Test connection” makes a small server-side request without flashcard or account data; credentials and provider response bodies are never shown. Approved models are Groq `openai/gpt-oss-120b`/`openai/gpt-oss-20b`, NVIDIA NIM `meta/llama-3.3-70b-instruct`/`meta/llama-3.1-8b-instruct`, OpenAI `gpt-4.1-mini`/`gpt-4o-mini`, and Gemini `gemini-3.5-flash`/`gemini-3.5-flash-lite`. The allowlist is enforced in both Edge Functions and by a database constraint. Normal users cannot read or change settings under RLS. A failed provider leaves the original local result in place with an AI-unavailable message. Edge rate limits are per running instance, not a durable global quota; enforce an upstream/project-wide budget separately for stronger cost control.

The request contains only question, expected answer, typed answer, accepted alternatives, subject, language and fixed marking guidance. It omits account identity, notes, hints, deck contents, due dates and review history. Inputs are limited to 700 characters per answer; accepted alternatives are capped at ten and private-looking text is rejected before the model call. AI output is strictly validated and shown as text. Timeouts, malformed responses, missing configuration, sign-out, and rate limits leave the local result intact. The ten-per-hour server limit is **per running function instance**; without a shared durable counter, concurrent instances or cold starts can exceed that soft limit. Groq's own account limits still apply. Do not store secrets in card questions, answers, or accepted alternatives, since those fields can be sent when you appeal. Leave AI appeals off if that data should remain entirely local.

### Security model and limits

- The browser and Electron renderer contain only a Supabase project URL and **publishable/legacy anon key**. They never contain a service-role key. Optional cloud sync uses the signed-in user's JWT plus the owner-only RLS policies in `supabase/schema.sql`; the tables cannot be safely used until that SQL has been applied to the Supabase project. Check policies again in the dashboard after any manual schema change. A service-role key bypasses RLS and must never be put in this project, Vercel, a release, or a client-side environment variable.
- Share codes are random bearer secrets. The database stores only their hash, and the anonymous preview function returns only an allowlisted deck snapshot. Anyone holding a live code can preview that snapshot until expiry or revocation. Revocation does not remove copies already imported by recipients. Do not put private notes or account data into card fronts/backs if you intend to share them. The mobile share-file export also omits notes, hints and progress.
- Account sessions and recently previewed share codes now use browser **sessionStorage**, not persistent localStorage. Upgrading removes the old Recall auth and share-code storage keys; signing in again will be required. Session storage remains readable by JavaScript in the same origin, so use a trusted device and avoid untrusted extensions. A fully HttpOnly-cookie session would require a separate trusted backend and is not part of this static app. Logout clears the local Supabase session; already-issued access tokens may remain valid until they expire. Local library data and sync recovery copies intentionally remain on the device after logout.
- Electron runs a sandboxed, context-isolated renderer without Node integration or IPC channels. Navigation, new windows, webviews and permission requests are denied. The desktop page and Vercel deployment use a restrictive Content Security Policy; Vercel also sets framing, referrer, MIME and browser-permission headers. The static app does not set cookies or implement its own CORS endpoint; the optional Supabase Edge Function has a bearer-token-protected CORS endpoint. Configure any Supabase Auth redirect/origin allowlist in the Supabase dashboard for your actual HTTPS site.
- Imports and shared snapshots are size-limited and validated; dynamic card and deck text is rendered as text, while IDs are escaped in attributes and folder colours are restricted to hex values. CSV/TSV exports prefix spreadsheet-formula-like cells. Full-library backup and ordinary deck CSV/TSV exports **do contain personal data** (including notes and/or progress); handle them as private files. The generated web/release allowlists exclude `.env.local`, tests and signing credentials. The mobile app is local-only and stores its library in AsyncStorage; device-level encryption and backup policies depend on the mobile OS.
- Password reset and account deletion are not automated in this client: they require an appropriately configured email flow or trusted server-side admin action, respectively. Do not expose a service-role key to implement either in the frontend. Use Supabase account administration for deletion and verify any project-specific retention/backups separately. Supabase project settings, CORS/Auth allowed origins, email delivery, and production security headers must be reviewed in the deployed project; repository tests cannot inspect a live project.
- Run `npm test`, `npm run test:smoke`, and `npm audit` before deploying. The root Electron dependency was updated to a non-vulnerable audited version. The separate Expo mobile toolchain still reports moderate transitive advisories; avoid a blind major downgrade and review its upstream fixes before distributing mobile builds.

## Project layout

- `app.js` — app behaviour, data migration, study mode, Test Mode, and library actions.
- `index.html` — app structure.
- `styles.css` — Recall visual design and themes.
- `test-utils.js` / `subject-utils.js` — independently testable app logic.
- `smoke-test.js` — Electron interaction test.
- `mobile/` — separate React Native / Expo mobile project.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the app's full version history. It is maintained alongside the code, independently of GitHub Releases.

## Get the Windows release

Download **Recall-Flashcards-1.3.1-win-x64-setup.exe** from the [GitHub Releases page](https://github.com/kiy-codes/recall-flashcards/releases). Install it, then launch Recall Flashcards from the Start menu or desktop. Cloud accounts are optional and require your own Supabase project configuration; the release works locally without it.

Local copies of published packages are collected under `installations/<version>/`, alongside release notes and `SHA256SUMS.txt`. The installations folder's [README](installations/README.md) is tracked in Git; the versioned binary folders remain local, and packages are uploaded as GitHub Release assets.

## Very basic instructions

### To use Recall

1. If someone has sent you the Recall installer, double-click the `.exe` file and follow the on-screen steps.
2. Open **Recall Flashcards** from the Start menu or desktop.
3. Select **Library**, then create a deck or open one you already have.
4. Add cards by typing them in, pasting a list, or importing a CSV/TSV file.
5. Press **Study**. Tap the card (or use the arrow keys) to flip it, then mark whether you got it right.

### To keep a backup

1. Open the deck you want to save.
2. Choose **Export CSV**, **Export TSV**, or **Share decks**.
3. Save the downloaded file somewhere you will remember, such as Documents or OneDrive.

Your cards and progress stay on your computer unless you export them. If you change computers, export your decks first, then import the saved file on the new computer.
