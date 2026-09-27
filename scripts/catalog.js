const fs = require('node:fs');
const path = require('node:path');
const Core = require('../catalog-core');

function readUtf8(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 2097152) throw new Error('Library file is missing or too large.');
  return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file));
}

function loadCatalog(root = path.resolve(__dirname, '..')) {
  const base = path.resolve(root, 'content', 'flashcard-library');
  const manifest = JSON.parse(readUtf8(path.join(base, 'index.json')));
  if (!manifest || manifest.format !== 'recall-catalog-v1' || !Array.isArray(manifest.decks) || manifest.decks.length > 100 || Object.keys(manifest).sort().join(',') !== 'decks,format') throw new Error('Invalid flashcard library index.');
  const ids = new Set(), files = new Set();
  return manifest.decks.map(raw => {
    const meta = Core.validateEntry(raw);
    if (ids.has(meta.id) || files.has(meta.file)) throw new Error('Duplicate flashcard library ID or file.');
    ids.add(meta.id); files.add(meta.file);
    const file = path.resolve(root, meta.file);
    const real = fs.realpathSync(file);
    if (!real.startsWith(base + path.sep)) throw new Error('Library file escapes its directory.');
    return Core.validateDeck(meta, readUtf8(real));
  });
}

function buildCatalog(root, outfile) {
  const entries = loadCatalog(root);
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  fs.writeFileSync(outfile, `window.RecallCatalogData = Object.freeze(${JSON.stringify({ entries })});\n`);
  return entries;
}
module.exports = { loadCatalog, buildCatalog, readUtf8 };
