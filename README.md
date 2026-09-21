# Recall Flashcards

Recall is a calm, local-first flashcard app for Windows. It is built with Electron and keeps decks, folders, cards, learning progress, session history, tests, and preferences on the computer running the app.

## Features

- Create decks and organise them in coloured, collapsible folders.
- Add cards manually, paste text lists, or import CSV, TSV, and Recall share files.
- Customise the names of both card sides for every deck.
- Study with flip cards or typed answers, including forgiving answer matching.
- Use keyboard controls, shuffle, Due cards and other card filters, hints, flags, undo, fullscreen study, and custom keybinds.
- Keep a local review schedule: new cards are due immediately, successful reviews move forward through gentle intervals, and missed cards return soon.
- Track New, Learning, and Mastered card states, missed cards, streaks, session accuracy, and activity.
- Add tags, search cards, edit cards in bulk, detect duplicates, and export decks.
- Use Test Mode for typed, multiple-choice, or mixed assessments with time limits, saved results, review, retry, and history.
- Add deck tags in **Deck details**. Tags such as `Biology: Cells` are subject tags: they are copied to every card in that deck and can provide a subtle deck colour accent.
- Sort Library decks by Subject, name, card count, or manual order.
- Choose light, dark, or system theme and set subject colours locally.

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
npx electron .\smoke-test.js
```

## Build a Windows installer

Create an installable `.exe`:

```powershell
npm run dist
```

The installer is written to the `release` folder.

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

Recall is local-first. It does not require an account or cloud connection. Your study data is saved in your browser storage on this computer. Export decks or Recall share files if you want a portable backup.

## Project layout

- `app.js` — app behaviour, data migration, study mode, Test Mode, and library actions.
- `index.html` — app structure.
- `styles.css` — Recall visual design and themes.
- `test-utils.js` / `subject-utils.js` — independently testable app logic.
- `smoke-test.js` — Electron interaction test.
- `mobile/` — separate React Native / Expo mobile project.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the app's full version history. It is maintained alongside the code, independently of GitHub Releases.

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
