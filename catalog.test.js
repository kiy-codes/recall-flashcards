const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Core = require('./catalog-core');
const { loadCatalog, buildCatalog } = require('./scripts/catalog');
const root = __dirname;
const sample = loadCatalog(root)[0];
const header = Core.CSV_COLUMNS.join(',');
const sampleRow = ['Q', 'A', 'Physics', 'science', '', '', 'waves', '', '', 'false', 'New', 'false', '0', '0', 'unknown', '', '', ''];
const csv = rows => [header, ...rows].join('\r\n');
const meta = count => ({ id: 'gcse-aqa-physics-test', title: 'Test', description: 'A test deck.', qualification: 'GCSE', examBoard: 'AQA', subject: 'Physics', topic: 'Waves', version: '1.0.0', verified: false, cardCount: count, file: 'content/flashcard-library/gcse/aqa/physics/test.csv' });

test('versioned sample library validates and uses the existing 18-column exporter schema', () => {
  const entries = loadCatalog(root);
  assert.equal(entries.length, 5);
  assert.equal(entries.reduce((sum, entry) => sum + entry.cards.length, 0), 162);
  assert.deepEqual(entries.map(entry => entry.qualification).sort(), ['A Level', 'GCSE', 'International GCSE', 'International GCSE', 'International GCSE']);
  const chemistry = entries.filter(entry => entry.subject === 'Chemistry');
  assert.deepEqual(chemistry.map(entry => entry.cardCount), [50, 50, 50]);
  assert.ok(chemistry.every(entry => entry.examBoard === 'Edexcel' && entry.verified === false));
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /const EXPORT_COLUMNS = RecallCatalogCore\.CSV_COLUMNS/);
  assert.equal(Core.CSV_COLUMNS.length, 18);
  assert.equal(entries.every(entry => entry.verified === false), true);
});

test('strict CSV accepts UTF-8, quoted commas and quotes, but rejects malformed rows', () => {
  const quoted = [...sampleRow]; quoted[0] = 'What is "wave speed", in m/s?\nGive units.'; quoted[1] = 'speed, in m/s';
  const line = quoted.map(cell => /[,"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(',');
  assert.equal(Core.validateDeck(meta(1), '\uFEFF' + csv([line])).cards[0].front, quoted[0]);
  assert.throws(() => Core.parseCSV(csv(['"unclosed'])), /CSV/);
  assert.throws(() => Core.parseCSV(csv(['"Q"x,A'])), /CSV/);
  assert.throws(() => Core.parseCSV(csv(['Q,A'])), /CSV/);
  assert.throws(() => Core.parseCSV(csv([''])), /CSV/);
});

test('validation rejects empty sides, duplicates, wrong count, metadata and study progress', () => {
  const base = sampleRow.join(',');
  assert.equal(Core.validateDeck(meta(1), csv([base])).cards.length, 1);
  assert.throws(() => Core.validateDeck(meta(2), csv([base])), /card count/);
  assert.throws(() => Core.validateDeck(meta(2), csv([base, base])), /duplicate/);
  assert.throws(() => Core.validateDeck(meta(2), csv([base, ['q!', 'A', ...sampleRow.slice(2)].join(',')])), /duplicate/);
  assert.throws(() => Core.validateDeck(meta(1), csv([[...sampleRow.slice(0, 1), '', ...sampleRow.slice(2)].join(',')])), /second side/);
  assert.throws(() => Core.validateDeck(meta(1), csv([[...sampleRow.slice(0, 10), 'Mastered', ...sampleRow.slice(11)].join(',')])), /fresh study state/);
  assert.throws(() => Core.validateEntry({ ...meta(1), file: '../private.csv' }), /metadata/);
  assert.throws(() => Core.validateEntry({ ...meta(1), verified: 'true' }), /metadata/);
  assert.throws(() => Core.validateEntry({ ...meta(1), qualification: '' }), /qualification/);
});

test('copying a catalog deck creates independent editable cards with fresh identities and progress', () => {
  let id = 0;
  const copied = Core.copyDeck(sample, () => `copy-${++id}`);
  assert.equal(copied.cards.length, sample.cardCount);
  assert.equal(copied.id, 'copy-1');
  assert.equal(new Set(copied.cards.map(card => card.id)).size, sample.cardCount);
  assert.ok(copied.cards.every(card => card.state === 'New' && card.reviewCount === 0 && card.correctStreak === 0));
  copied.cards[0].front = 'Changed locally'; copied.tags.push('personal');
  assert.notEqual(copied.cards[0].front, sample.cards[0].front);
  assert.equal(sample.tags.includes('personal'), false);
  assert.equal(copied.sourceLibrary.examBoard, 'AQA');
});

test('catalog build embeds only validated static deck content', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-catalog-test-'));
  try {
    const outfile = path.join(directory, 'catalog-data.js');
    const entries = buildCatalog(root, outfile);
    const output = fs.readFileSync(outfile, 'utf8');
    assert.equal(entries.length, 5);
    assert.match(output, /RecallCatalogData/);
    assert.doesNotMatch(output, /GROQ_API_KEY|SUPABASE_SERVICE_ROLE_KEY|reviewHistory|password/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
