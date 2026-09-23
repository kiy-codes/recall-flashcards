# Changelog

## Unreleased

- Mobile: New deck, New folder, Move to folder, Study again, Duplicate card, and Undo no longer erase the whole library. Study sessions are saved reliably, and folder Rename works on Android.
- Shared deck files can no longer inject HTML into the app. Folder colours are validated, names always display as text, and the app has a Content-Security-Policy.
- Share imports now follow the review screen: unticked rows are skipped and edited text is used.
- Saved data stays small (tests no longer store a copy of every card), a full disk shows a message instead of breaking the study screen, and an unreadable library is kept as a backup instead of being deleted.
- The bulk "Move to" menu works with any deck, and the missed-cards filter no longer sticks to later tests.
- CSV/TSV exports are safe to open in spreadsheet apps.
- Electron 44 with navigation guards; unused Android permissions removed.

## 1.0.0 — Initial public release

Recall Flashcards is now ready for its first public release.

- Local-first Windows desktop flashcards with custom decks, coloured folders, deck-level tags, search, sorting, and drag-and-drop organisation.
- Flip-card, typed-answer, and Test Mode study experiences with keyboard controls, fullscreen focus, undo, session history, and local progress tracking.
- New, Learning, and Mastered card states; flags, hints, notes, alternatives, Due Cards scheduling, streaks, accuracy charts, and a study heatmap.
- Safe pasted-text, CSV, TSV, and Recall share-file imports, including review before importing and local exports.
- Deck subjects, domains, language metadata, grammatical-gender detection, language-aware gender testing, and custom light/dark/system themes.

Earlier internal development builds are preserved in `archive/internal-development-builds` and are not part of the public release history.
