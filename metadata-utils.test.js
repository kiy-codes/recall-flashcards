const test = require('node:test');
const assert = require('node:assert/strict');
const metadata = require('./metadata-utils');

test('deck tags are case-insensitive but keep the first spelling', () => {
  assert.deepEqual(metadata.normaliseDeckTags(['Travel', ' travel ', 'VERBS', 'verbs']), ['Travel', 'VERBS']);
});

test('legacy per-card tags migrate into the deck without dropping unresolved values', () => {
  const migration = metadata.migrateLegacyCardTags(['Travel'], [{ tags: ['verbs', 'travel'] }, { tags: 'Beginner, verbs' }, { tags: [42] }]);
  assert.deepEqual(migration.tags, ['Travel', 'verbs', 'Beginner']);
  assert.deepEqual(migration.unresolved, [42]);
});

test('recognises common grammatical gender markers and preserves the original marker', () => {
  const german = metadata.extractWordInfo('Abiturfeier (f)');
  assert.equal(german.cleanWord, 'Abiturfeier'); assert.equal(german.wordInfo.gender, 'feminine'); assert.equal(german.wordInfo.originalMarker, '(f)');
  assert.equal(metadata.genderFromMarker('femenino'), 'feminine');
  assert.equal(metadata.genderFromMarker('neutrum'), 'neuter');
  assert.equal(metadata.genderFromMarker('maybe'), 'unknown');
});

test('suggests common import columns and extracts a trailing gender marker', () => {
  const mapping = metadata.suggestImportMappings(['Word', 'Translation', 'Gender', 'Part of speech', 'Notes', 'Hint', 'Accepted alternatives', 'Tags']);
  assert.deepEqual(mapping, { front: 0, back: 1, gender: 2, partOfSpeech: 3, notes: 4, hint: 5, alternatives: 6, tags: 7 });
  const imported = metadata.wordInfoFromImport('Abiturfeier (f)', '');
  assert.equal(imported.cleanWord, 'Abiturfeier'); assert.equal(imported.wordInfo.gender, 'feminine'); assert.equal(imported.wordInfo.originalMarker, '(f)');
});

test('explicit import gender can be mapped, corrected, or removed without creating tags', () => {
  const explicit = metadata.wordInfoFromImport('libro', 'masculine');
  assert.equal(explicit.wordInfo.gender, 'masculine'); assert.equal(explicit.wordInfo.originalMarker, 'masculine');
  assert.equal(metadata.wordInfoFromImport('haus (n)', '', 'feminine').wordInfo.gender, 'feminine');
  const removed = metadata.wordInfoFromImport('haus (n)', '', 'none');
  assert.equal(removed.cleanWord, 'haus'); assert.equal(removed.wordInfo.gender, 'unknown');
  assert.equal(Object.hasOwn(explicit, 'tags'), false);
});

test('German gender choices use articles while other languages use neutral labels', () => {
  assert.deepEqual(metadata.genderChoices({ code: 'de' }).map(choice => choice.label), ['der', 'die', 'das']);
  assert.deepEqual(metadata.genderChoices({ code: 'fr' }).map(choice => choice.label), ['le', 'la']);
  assert.deepEqual(metadata.genderChoices({ code: 'el' }).map(choice => choice.label), ['ο', 'η', 'το']);
});

test('gender-test eligibility excludes non-language and unknown-gender cards', () => {
  const germanNoun = { domain: 'language', language: { code: 'de' }, wordInfo: { gender: 'neuter' } };
  assert.equal(metadata.isGenderEligible(germanNoun), true);
  assert.equal(metadata.genderAnswerFor(germanNoun), 'das');
  assert.equal(metadata.isGenderEligible({ ...germanNoun, domain: 'science' }), false);
  assert.equal(metadata.isGenderEligible({ ...germanNoun, wordInfo: { gender: 'unknown' } }), false);
});

test('typed-answer evaluation separates exact answers, safe typos, and incorrect answers', () => {
  assert.equal(metadata.evaluateTypedAnswer('  Hello!! ', 'hello').classification, 'exact');
  assert.equal(metadata.evaluateTypedAnswer('hellp', 'hello').classification, 'typo');
  assert.equal(metadata.evaluateTypedAnswer('hallo', 'hello').classification, 'incorrect');
  assert.equal(metadata.evaluateTypedAnswer('cafe', 'café').classification, 'incorrect');
});
