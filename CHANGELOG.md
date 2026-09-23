# Changelog

## Unreleased - Optional accounts and cloud backup

- Added optional Supabase email/password accounts, session restoration, manual upload/download, sync status and per-account last-sync time.
- Added revision-checked cloud writes, explicit overwrite choices, conservative safe merging, local recovery copies, and full-library backup files.
- Kept the existing localStorage library and offline study workflow, with a cached static website for offline reopening.
- Added Free-plan setup documentation, per-user RLS SQL, ignored environment configuration, static Vercel output and bundled Electron client support.
- Added credential-free unit, PostgreSQL policy and Electron/web smoke checks; corrected stale assertions and failure exit reporting in the existing smoke harness.

## 1.0.2 - Navigation and interface polish

- Added a focused Home dashboard as the app’s starting screen.
- Reworked navigation so Study, Add cards, and Test open directly for the active deck, while Library remains the deck chooser.
- Prevented hidden revision screens from appearing below the dashboard.
- Simplified the top bar: one Library route, one Test route, and a compact Settings icon on the right.
- Improved view changes so they start at the top of the selected screen.

## 1.0.1 - Test Mode improvements and bug fixes

- Test Mode now starts with the currently open deck, with optional folder selection kept in a collapsible section.
- Untimed tests show elapsed time without a hidden countdown limit.
- Gender quiz prompts no longer reveal the grammatical-gender marker.
- Improved Test Mode focus and control behaviour, plus visual alignment fixes across card rows.

## 1.0.0 — Initial public release

Recall Flashcards is now ready for its first public release.

- Local-first Windows desktop flashcards with custom decks, coloured folders, deck-level tags, search, sorting, and drag-and-drop organisation.
- Flip-card, typed-answer, and Test Mode study experiences with keyboard controls, fullscreen focus, undo, session history, and local progress tracking.
- New, Learning, and Mastered card states; flags, hints, notes, alternatives, Due Cards scheduling, streaks, accuracy charts, and a study heatmap.
- Safe pasted-text, CSV, TSV, and Recall share-file imports, including review before importing and local exports.
- Deck subjects, domains, language metadata, grammatical-gender detection, language-aware gender testing, and custom light/dark/system themes.

Earlier internal development builds are preserved in `archive/internal-development-builds` and are not part of the public release history.
