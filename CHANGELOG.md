# Changelog

All notable Recall changes are recorded here, even when the app is not published as a GitHub Release.

## 1.6.0 — Spaced-repetition foundation

- Added local due dates, last-review times, repetition counts, lapses, and a scheduler version to cards.
- Added a local review log containing the card, outcome, review time, and response time.
- Added **Due cards** to the study-session filter.
- Correct answers now follow simple increasing intervals; retries return in 10 minutes.
- Added safe migration for older cards and undo support for scheduling changes.

## 1.5.x — Subjects, deck tags, and library polish

- Added subject tags written as `Subject: Topic`, primary deck subjects, subtle subject colours, and subject sorting.
- Added Deck details and deck-wide tags, which can be copied to existing cards.
- Improved deck-card controls, themed menus and dropdowns, dark mode, fonts, flags, and settings/keybind controls.
- Added light, dark, and system themes, custom keyboard shortcuts, and WASD study controls.

## 1.4.x — Finished Test Mode

- Added a separate test setup flow for one or more decks/folders, tags, card-state filters, answer styles, and timed tests.
- Added typed, multiple-choice, and mixed questions with keyboard support and forgiving typed-answer matching.
- Added countdowns, exit confirmation, saved Test History, filters, reopening, deletion, complete question review, and retry/study-missed actions.
- Kept test results separate from normal study progress and card learning states.

## 1.3.x — Cards, importing, and progress

- Added card states (New, Learning, Mastered), flags, missed-card tracking, hints, notes, typed answers, session filters, and undo.
- Added tags, search, bulk card actions, duplicate detection, CSV/TSV importing and exporting, import previews, and local multi-deck share files.
- Added session accuracy history, attempt lists, streaks, and a study activity heatmap.
- Added folders, drag-and-drop deck organisation, folder colours, collapse controls, sorting, filtering, and a full-screen library grid.

## 1.2.x — Study experience

- Added card flipping, animations, shuffle/repeat options, fullscreen focus study, custom side labels, and arrow-key controls.
- Added local deck/folder creation, renaming, reordering, deletion, pasted-list importing, and sensible separator presets.

## 1.0.0 — First Recall app

- Created the Windows Electron flashcard app with local deck storage and a modern Recall design.
- Added the separate Expo/React Native mobile project for Android development.
