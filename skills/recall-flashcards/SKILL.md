---
name: recall-flashcards
description: Generate validated Recall Flashcards CSV decks or version-controlled library decks for a requested qualification, exam board, subject, topic, and card count.
---

# Generate Recall flashcards

Produce a UTF-8 CSV that Recall can import. For a library-deck request, also produce one metadata object for `content/flashcard-library/index.json` and place the CSV at its `file` path. The same CSV format is used in both modes. Do not assume GCSE, AQA, or any other qualification or board unless requested.

## Content decisions

- Use the user's source material or an authoritative, current specification for the requested qualification and exam board. Distinguish verified syllabus coverage from a draft: set `verified: true` only after a human has checked every card against the named specification; generated drafts are `false`.
- Make exactly the requested number of distinct, concise active-recall cards. One concept or question per front, a directly markable answer on the back. Mix definitions, understanding, and application; include equations or calculations when relevant. Check units and worked numerical answers.
- Remove duplicates and near-duplicates, including rephrased questions testing the same answer. Do not invent facts or filler to reach the count. If the available source cannot support the requested number, report the shortfall and request more material instead of claiming an incomplete deck meets the count.
- Paraphrase source material rather than copying extended passages. Keep cards within Recall's 700-character limit per side. Use deck-level tags for topic/category; use card notes, hints, gender, part of speech, and accepted answers only when useful and supported by the source.

## Exact Recall CSV format

Use this exact header and order (Recall's current `catalog-core.js` and `app.js` exporter):

```csv
first_side,second_side,deck_subject,deck_domain,deck_language_code,deck_language_name,deck_tags,notes,hint,flagged,state,missed,correct_streak,review_count,gender,original_marker,part_of_speech,accepted_answers
```

Every row has all 18 cells. Repeat deck-level subject, domain, language and tags consistently. `deck_domain` is one of `language`, `science`, `history`, `medicine`, `law`, `other`. Use empty language fields for non-language decks. Separate deck tags and accepted alternatives with commas *inside their CSV cell*; do not put a comma inside one tag or alternative. For fresh cards set `flagged=false`, `state=New`, `missed=false`, `correct_streak=0`, `review_count=0`, `gender=unknown` unless a valid language gender applies. Leave optional fields empty where not relevant. Never insert due dates, review history, accounts, secrets, or private notes.

Follow RFC 4180 CSV quoting: quote any cell containing a comma, double quote or line break; double embedded quotes. Save valid UTF-8 (not a Markdown table or fenced CSV when writing the actual file). Avoid spreadsheet-formula-leading text in cells; if unavoidable, prefix an apostrophe as Recall's exporter does.

## Library metadata

For a library deck, add an entry to `content/flashcard-library/index.json` with `id`, `title`, `description`, `qualification`, `examBoard`, `subject`, `topic`, optional `subtopic`, `version` (`X.Y.Z`), `verified` (boolean), `cardCount`, and `file`. Use a unique lowercase hyphenated ID and a CSV path under `content/flashcard-library/`, such as `content/flashcard-library/gcse/aqa/physics/waves.csv`. `cardCount` must equal the requested number and the number of CSV data rows. Keep title to 70 characters and each card side to 700.

## Validate before delivery

Run `npm run library:validate` for the full repository catalog. To validate a newly generated CSV and its single metadata JSON object before adding it to the manifest, run `npm run library:validate -- --metadata path/to/entry.json --csv path/to/deck.csv`. Fix invalid CSV, metadata, empty sides, duplicates, and count mismatches. Then report the exact validated card count and file paths. If no local validator is available, manually parse the CSV, count data rows, verify the header/18 cells and metadata, and state that automated validation was not run.
