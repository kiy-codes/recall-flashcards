# Recall Flashcards

**v1.2.0 — Deck sharing, cross-platform packages, and security hardening**

Recall is a calm, local-first flashcard app for desktop and web. It is built with Electron and keeps decks, folders, cards, learning progress, session history, tests, and preferences on the device running the app.

## Features

- Create decks and organise them in coloured, collapsible folders.
- Add cards manually, paste text lists, or import CSV, TSV, and Recall share files.
- Use the three-stage import review to choose deck details, map word metadata, and check every card before importing.
- Customise the names of both card sides for every deck.
- Study with flip cards or typed answers, including forgiving answer matching.
- Use keyboard controls, shuffle, Due cards and other card filters, hints, flags, undo, fullscreen study, and custom keybinds.
- Keep a local review schedule: new cards are due immediately, successful reviews move forward through gentle intervals, and missed cards return soon.
- Track New, Learning, and Mastered card states, missed cards, streaks, session accuracy, and activity.
- Add tags, search cards, edit cards in bulk, detect duplicates, and export decks.
- Use Test Mode for typed, multiple-choice, or mixed assessments with time limits, saved results, review, retry, and history.
- Language decks with recognised gender data can also run article/gender tests (for example German `der` / `die` / `das`).
- Set a subject, domain, optional language, and deck tags in **Deck details**. Tags describe the whole deck; legacy per-card tags are migrated safely when you open the updated app.
- Add optional word details such as grammatical gender, source markers, part of speech, and accepted alternatives. Language decks can offer a gender quiz where the data supports it.
- Sort Library decks by Subject, name, card count, or manual order.
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
release-1.2.0/
  windows/x64/build-<UTC-time>-<unique-id>/
    Recall-Flashcards-1.2.0-win-x64-setup.exe
    Recall-Flashcards-1.2.0-win-x64-portable.exe
    Recall-Flashcards-1.2.0-win-x64-zip.zip
    Recall-Flashcards-1.2.0-win-x64-msi.msi
    BUILD-NOTES.md
    .app/             (generated packaging input)
    win-unpacked/    (generated runnable application)
  linux/x64/build-<UTC-time>-<unique-id>/
  macos/arm64/build-<UTC-time>-<unique-id>/
```

The flat, Git-ignored `release-1.2.0/github-upload/` folder is the staging area for verified artifacts from each host. The Linux tar archive is named `Recall-Flashcards-1.2.0-linux-x64-archive.tar.gz` there; Electron Builder's original output has a redundant `.tar.gz` in its filename. Merely placing files in the folder does not upload anything.

Each invocation prints its exact output path and writes a build note with completion status and artifact paths. A failed build retains its partial output for inspection. Repeated builds always create a fresh directory: there is no release-folder cleanup or overwrite of previous artifacts or user files. Directory junctions/symlinks are rejected. Existing `release/`, `release-1.0.*`, and their installers are preserved. Release folders remain Git-ignored.

All packages are unsigned. Windows can show an unknown-publisher/SmartScreen warning, and macOS Gatekeeper may block an unnotarized app. Signing and notarization are **manual/future only**: Windows trusted certificates/services and Apple Developer ID/notarization are deliberately not configured. [AppX](https://www.electron.build/docs/appx/) is only an unsigned preview here: ordinary sideload installation needs an appropriate trusted signing certificate (a self-signed certificate can be free but requires explicit local trust setup). No certificate is generated or installed and no machine trust settings are changed. The placeholder AppX identity is for local experiments, not Store submission. Microsoft Store publishing is **manual/future only**. The installed Electron Builder 26.15.3 does not provide a native MSIX target, so MSIX is also **manual/future only**. [PKG signing](https://www.electron.build/docs/pkg/) would require a separate Developer ID Installer certificate; unsigned PKG generation does not.

### Release configuration and privacy

Release builds always compile a fresh client inside their own output directory with Supabase disabled. They never read `.env` or `.env.local`, never copy them into packages, and do not reuse or overwrite the generated development/web client. Only explicitly allowed application files and minimal package metadata are staged; dependencies used in the browser are bundled by esbuild. The existing `build:client`, `build:web`, `npm start` and Vercel configuration retain their current behavior.

To deliberately configure a cloud-enabled local release, supply `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or the legacy public `SUPABASE_ANON_KEY`) in the process environment and append `-- --with-cloud`, for example `npm run dist:win -- --with-cloud`. Both values become public in the package; secret/service-role keys are rejected. Even this opt-in does not load env files. Signing and publishing credentials are removed from the dedicated packaging process, and there are no publishing or output-path overrides in these scripts.

## Review scheduling

Recall stores the next due time, last review time, successful repetitions, and lapses on every card. It also keeps a local review log with the result and time taken for each review. Older cards are migrated safely as new, immediately due cards. The small baseline scheduler is isolated in `scheduler.js`, so it can later be replaced with FSRS without changing the rest of the app.

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

See [Optional accounts and cloud backup](docs/CLOUD_SYNC.md) for the verified free-plan assumptions, email confirmation limitations, dashboard steps, SQL policies, environment configuration, and conflict choices. Cloud features are disabled until the two public Supabase configuration values are supplied. No paid service is required; review the free-plan limits and assumptions before configuring a project.

For a static Vercel-compatible build, run `npm run build:web` and serve only `dist-web`. Node 22.12 or later is required. Electron continues to start with `npm start`. The static site can reopen offline after its first visit finishes caching.

### Security model and limits

- The browser and Electron renderer contain only a Supabase project URL and **publishable/legacy anon key**. They never contain a service-role key. Optional cloud sync uses the signed-in user's JWT plus the owner-only RLS policies in `supabase/schema.sql`; the tables cannot be safely used until that SQL has been applied to the Supabase project. Check policies again in the dashboard after any manual schema change. A service-role key bypasses RLS and must never be put in this project, Vercel, a release, or a client-side environment variable.
- Share codes are random bearer secrets. The database stores only their hash, and the anonymous preview function returns only an allowlisted deck snapshot. Anyone holding a live code can preview that snapshot until expiry or revocation. Revocation does not remove copies already imported by recipients. Do not put private notes or account data into card fronts/backs if you intend to share them. The mobile share-file export also omits notes, hints and progress.
- Account sessions and recently previewed share codes now use browser **sessionStorage**, not persistent localStorage. Upgrading removes the old Recall auth and share-code storage keys; signing in again will be required. Session storage remains readable by JavaScript in the same origin, so use a trusted device and avoid untrusted extensions. A fully HttpOnly-cookie session would require a separate trusted backend and is not part of this static app. Logout clears the local Supabase session; already-issued access tokens may remain valid until they expire. Local library data and sync recovery copies intentionally remain on the device after logout.
- Electron runs a sandboxed, context-isolated renderer without Node integration or IPC channels. Navigation, new windows, webviews and permission requests are denied. The desktop page and Vercel deployment use a restrictive Content Security Policy; Vercel also sets framing, referrer, MIME and browser-permission headers. The static app does not set cookies or implement its own CORS endpoint. Configure any Supabase Auth redirect/origin allowlist in the Supabase dashboard for your actual HTTPS site.
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

Download **Recall-Flashcards-1.2.0-win-x64-setup.exe** from the [GitHub Releases page](https://github.com/kiy-codes/recall-flashcards/releases). Install it, then launch Recall Flashcards from the Start menu or desktop. Cloud accounts are optional and require your own Supabase project configuration; the release works locally without it.

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
