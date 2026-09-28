// Canonical source: supabase/functions/_shared/catalog-core.js. Build copies it to the browser shell.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RecallCatalogCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  // Keep this in step with app.js's CSV export. The test suite checks equality.
  const CSV_COLUMNS = ['first_side', 'second_side', 'deck_subject', 'deck_domain', 'deck_language_code', 'deck_language_name', 'deck_tags', 'notes', 'hint', 'flagged', 'state', 'missed', 'correct_streak', 'review_count', 'gender', 'original_marker', 'part_of_speech', 'accepted_answers'];
  const DOMAINS = new Set(['language', 'science', 'history', 'medicine', 'law', 'other']);
  const GENDERS = new Set(['masculine', 'feminine', 'neuter', 'common', 'unknown', 'not_applicable']);
  const MAX_PUBLICATION_BYTES = 2097152;
  const PUBLIC_METADATA = ['title', 'description', 'qualification', 'examBoard', 'subject', 'topic', 'subtopic', 'version', 'verified'];
  const normalizeText = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const requiredText = (value, label, max) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error(`Invalid ${label}.`);
    return value.trim();
  };
  const optionalText = (value, label, max) => {
    if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error(`Invalid ${label}.`);
    return value.trim();
  };
  const splitList = (value, label, maxItems) => {
    const items = value ? value.split(',').map(item => item.trim()) : [];
    if (items.length > maxItems || items.some(item => !item || item.length > 100) || new Set(items.map(item => item.toLocaleLowerCase())).size !== items.length) throw new Error(`Invalid ${label}.`);
    return items;
  };

  function validateCards(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 2000) throw new Error('A catalogue deck must have 1–2,000 cards.');
    const seen = [];
    return values.map((value, index) => {
      if (!plain(value)) throw new Error(`Invalid card ${index + 1}.`);
      const at = `card ${index + 1}`;
      const info = value.wordInfo === undefined || value.wordInfo === null ? {} : value.wordInfo;
      if (!plain(info)) throw new Error(`Invalid ${at} word information.`);
      const alternatives = value.acceptedAnswers === undefined ? [] : value.acceptedAnswers;
      if (!Array.isArray(alternatives) || alternatives.length > 30) throw new Error(`Invalid ${at} accepted answers.`);
      const acceptedAnswers = alternatives.map(item => requiredText(item, `${at} accepted answer`, 100));
      if (new Set(acceptedAnswers.map(item => item.toLowerCase())).size !== acceptedAnswers.length) throw new Error(`Invalid ${at} accepted answers.`);
      const gender = info.gender === undefined ? 'unknown' : optionalText(info.gender, `${at} gender`, 30) || 'unknown';
      if (!GENDERS.has(gender)) throw new Error(`Invalid ${at} gender.`);
      const card = {
        front: requiredText(value.front, `${at} first side`, 700), back: requiredText(value.back, `${at} second side`, 700),
        notes: optionalText(value.notes === undefined ? '' : value.notes, `${at} notes`, 2000),
        hint: optionalText(value.hint === undefined ? '' : value.hint, `${at} hint`, 700), acceptedAnswers,
        wordInfo: { gender, originalMarker: optionalText(info.originalMarker === undefined || info.originalMarker === null ? '' : info.originalMarker, `${at} original marker`, 80) || null,
          partOfSpeech: optionalText(info.partOfSpeech === undefined || info.partOfSpeech === null ? '' : info.partOfSpeech, `${at} part of speech`, 100) || null },
      };
      const front = normalizeText(card.front), back = normalizeText(card.back);
      if (seen.some(other => other.front === front || (other.back === back && other.front.length > 20 && front.length > 20 && (other.front.includes(front) || front.includes(other.front))))) throw new Error(`${at}: duplicate or near-duplicate card.`);
      seen.push({ front, back });
      return card;
    });
  }

  function preparePublication(metadata, source) {
    if (!plain(metadata) || Object.keys(metadata).some(key => !PUBLIC_METADATA.includes(key)) || !plain(source)) throw new Error('Invalid publication data.');
    const meta = validateEntry({ ...metadata, id: 'web-preview', cardCount: source.cards?.length, file: 'content/flashcard-library/remote/web-preview.csv' });
    if (!['GCSE', 'International GCSE'].includes(meta.qualification) || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(meta.version)) throw new Error('Choose GCSE or International GCSE and a semantic version such as 1.0.0.');
    if (!normalizeText(meta.title)) throw new Error('The public title must include a letter or number.');
    const domain = source.domain === undefined ? 'other' : source.domain;
    if (!DOMAINS.has(domain)) throw new Error('Invalid deck domain.');
    let language = null;
    if (source.language !== undefined && source.language !== null) {
      if (!plain(source.language) || domain !== 'language') throw new Error('Invalid deck language.');
      language = { code: requiredText(source.language.code, 'language code', 20), name: requiredText(source.language.name, 'language name', 100) };
    }
    const deck = { domain, language, cards: validateCards(source.cards) };
    const cleanMetadata = Object.fromEntries(PUBLIC_METADATA.map(key => [key, meta[key]]));
    const publication = { metadata: cleanMetadata, deck };
    const envelope = { action: 'publish', idempotencyKey: '00000000-0000-0000-0000-000000000000', ...publication };
    if (new TextEncoder().encode(JSON.stringify(envelope)).length > MAX_PUBLICATION_BYTES) throw new Error('Publication exceeds the 2 MiB limit.');
    return publication;
  }
  function publicationEntry(publication, id = 'web-preview') {
    const clean = preparePublication(publication.metadata, publication.deck);
    return { ...clean.metadata, id, file: `content/flashcard-library/remote/${id}.csv`, cardCount: clean.deck.cards.length,
      domain: clean.deck.domain, language: clean.deck.language, tags: [], cards: clean.deck.cards };
  }
  function validateRemoteEntry(row) {
    if (!plain(row) || !/^web-[a-f0-9]{32}$/.test(row.id) || !plain(row.snapshot) || row.snapshot.id !== row.id) throw new Error('Invalid online catalogue deck.');
    const metadata = Object.fromEntries(PUBLIC_METADATA.map(key => [key, row.snapshot[key]]));
    const entry = publicationEntry({ metadata, deck: row.snapshot }, row.id);
    if (row.snapshot.cardCount !== entry.cardCount || row.snapshot.file !== entry.file) throw new Error('Invalid online catalogue metadata.');
    return entry;
  }
  const contentKey = entry => JSON.stringify(entry.cards.map(card => [normalizeText(card.front), normalizeText(card.back)]).sort((a, b) => {
    const first = JSON.stringify(a), second = JSON.stringify(b);
    return first < second ? -1 : first > second ? 1 : 0;
  }));
  function mergeCatalogs(bundled, remoteRows) {
    if (!Array.isArray(bundled) || !Array.isArray(remoteRows)) throw new Error('Invalid catalogue.');
    const result = [...bundled], ids = new Set(bundled.map(entry => entry.id));
    for (const row of remoteRows) {
      const entry = validateRemoteEntry(row);
      if (ids.has(entry.id)) throw new Error('Online catalogue ID collision.');
      ids.add(entry.id); result.push(entry);
    }
    return result;
  }

  function parseCSV(text) {
    if (typeof text !== 'string' || text.length > 2097152) throw new Error('CSV is too large.');
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = []; let field = ''; let quoted = false; let closed = false;
    const finishField = () => { row.push(field); field = ''; closed = false; };
    const finishRow = () => { finishField(); rows.push(row); row = []; };
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
        else if (char === '"') { quoted = false; closed = true; }
        else field += char;
      } else if (char === '"') {
        if (field || closed) throw new Error('Malformed CSV quoting.');
        quoted = true;
      } else if (char === ',') finishField();
      else if (char === '\r' || char === '\n') {
        if (char === '\r' && text[index + 1] === '\n') index += 1;
        finishRow();
      } else {
        if (closed) throw new Error('Malformed CSV quoting.');
        field += char;
      }
    }
    if (quoted) throw new Error('Unclosed CSV quote.');
    if (row.length || field || closed) finishRow();
    if (!rows.length || rows.some(cells => cells.length !== CSV_COLUMNS.length)) throw new Error('CSV must use all Recall export columns.');
    if (rows[0].join('\u0000') !== CSV_COLUMNS.join('\u0000')) throw new Error('CSV header does not match Recall export columns.');
    if (rows.length < 2 || rows.length > 2001) throw new Error('CSV must have 1–2,000 cards.');
    return rows.slice(1).map((cells, index) => {
      if (cells.every(cell => !cell.trim())) throw new Error(`Empty CSV row ${index + 2}.`);
      return Object.fromEntries(CSV_COLUMNS.map((column, columnIndex) => [column, cells[columnIndex]]));
    });
  }

  function validateEntry(entry) {
    if (!plain(entry) || Object.keys(entry).some(key => !['id', 'title', 'description', 'qualification', 'examBoard', 'subject', 'topic', 'subtopic', 'version', 'verified', 'cardCount', 'file'].includes(key))) throw new Error('Invalid library metadata.');
    const clean = {
      id: requiredText(entry.id, 'deck ID', 100),
      title: requiredText(entry.title, 'title', 70),
      description: requiredText(entry.description, 'description', 500),
      qualification: requiredText(entry.qualification, 'qualification', 80),
      examBoard: requiredText(entry.examBoard, 'exam board', 80),
      subject: requiredText(entry.subject, 'subject', 100),
      topic: requiredText(entry.topic, 'topic', 120),
      subtopic: entry.subtopic === undefined ? '' : optionalText(entry.subtopic, 'subtopic', 120),
      version: requiredText(entry.version, 'version', 30),
      verified: entry.verified,
      cardCount: entry.cardCount,
      file: requiredText(entry.file, 'file path', 260),
    };
    if (Object.values(clean).some(value => typeof value === 'string' && /[\r\n]/.test(value)) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean.id) || !/^\d+\.\d+\.\d+$/.test(clean.version) || typeof clean.verified !== 'boolean' || !Number.isInteger(clean.cardCount) || clean.cardCount < 1 || clean.cardCount > 2000 || !/^content\/flashcard-library\/(?:[a-z0-9-]+\/)+[a-z0-9-]+\.csv$/.test(clean.file)) throw new Error('Invalid library metadata.');
    return clean;
  }

  function validateDeck(entry, csv) {
    const meta = validateEntry(entry);
    const rows = parseCSV(csv);
    if (rows.length !== meta.cardCount) throw new Error(`${meta.id}: card count does not match metadata.`);
    let domain = null, language = null, tags = null;
    const cards = rows.map((row, index) => {
      const at = `${meta.id} row ${index + 2}`;
      const front = requiredText(row.first_side, `${at} first side`, 700);
      const back = requiredText(row.second_side, `${at} second side`, 700);
      const subject = requiredText(row.deck_subject, `${at} subject`, 100);
      if (subject !== meta.subject || !DOMAINS.has(row.deck_domain)) throw new Error(`${at}: invalid deck subject or domain.`);
      const rowLanguage = { code: optionalText(row.deck_language_code, `${at} language code`, 20), name: optionalText(row.deck_language_name, `${at} language name`, 100) };
      if (Boolean(rowLanguage.code) !== Boolean(rowLanguage.name) || (row.deck_domain !== 'language' && rowLanguage.code)) throw new Error(`${at}: invalid language.`);
      const rowTags = splitList(row.deck_tags, `${at} deck tags`, 30);
      if (domain === null) { domain = row.deck_domain; language = rowLanguage.code ? rowLanguage : null; tags = rowTags; }
      else if (domain !== row.deck_domain || JSON.stringify(language) !== JSON.stringify(rowLanguage.code ? rowLanguage : null) || JSON.stringify(tags) !== JSON.stringify(rowTags)) throw new Error(`${at}: inconsistent deck metadata.`);
      if (row.flagged !== 'false' || row.state !== 'New' || row.missed !== 'false' || row.correct_streak !== '0' || row.review_count !== '0') throw new Error(`${at}: library cards must have fresh study state.`);
      const gender = optionalText(row.gender, `${at} gender`, 30) || 'unknown';
      if (!GENDERS.has(gender)) throw new Error(`${at}: invalid gender.`);
      const card = {
        front, back, notes: optionalText(row.notes, `${at} notes`, 2000), hint: optionalText(row.hint, `${at} hint`, 700),
        acceptedAnswers: splitList(row.accepted_answers, `${at} accepted answers`, 30),
        wordInfo: { gender, originalMarker: optionalText(row.original_marker, `${at} original marker`, 80) || null, partOfSpeech: optionalText(row.part_of_speech, `${at} part of speech`, 100) || null },
      };
      return card;
    });
    return { ...meta, domain, language, tags, cards: validateCards(cards) };
  }

  function copyDeck(entry, makeId) {
    if (!entry || !Array.isArray(entry.cards) || entry.cards.length !== entry.cardCount || typeof makeId !== 'function') throw new Error('Invalid library deck.');
    // Re-validate metadata and keep only known fields. No imported progress or IDs.
    const meta = validateEntry(Object.fromEntries(['id', 'title', 'description', 'qualification', 'examBoard', 'subject', 'topic', 'subtopic', 'version', 'verified', 'cardCount', 'file'].map(key => [key, entry[key]])));
    return {
      id: makeId(), name: meta.title, subject: meta.subject, domain: entry.domain,
      language: entry.language ? { ...entry.language } : null, tags: [...entry.tags],
      frontLabel: 'First side', backLabel: 'Second side',
      sourceLibrary: { id: meta.id, version: meta.version, qualification: meta.qualification, examBoard: meta.examBoard, topic: meta.topic, subtopic: meta.subtopic },
      cards: entry.cards.map(card => ({ id: makeId(), front: card.front, back: card.back, notes: card.notes, hint: card.hint, acceptedAnswers: [...card.acceptedAnswers], wordInfo: { ...card.wordInfo }, state: 'New', flagged: false, missed: false, correctStreak: 0, reviewCount: 0 })),
    };
  }
  return { CSV_COLUMNS, MAX_PUBLICATION_BYTES, PUBLIC_METADATA, normalizeText, contentKey, validateCards, preparePublication,
    publicationEntry, validateRemoteEntry, mergeCatalogs, parseCSV, validateEntry, validateDeck, copyDeck };
});
