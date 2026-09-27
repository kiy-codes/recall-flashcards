const fs = require('node:fs');
const path = require('node:path');
const Core = require('../catalog-core');
const { loadCatalog, readUtf8 } = require('./catalog');

function main(args = process.argv.slice(2)) {
  if (!args.length) {
    const entries = loadCatalog();
    console.log(`Validated ${entries.length} library decks and ${entries.reduce((sum, deck) => sum + deck.cards.length, 0)} cards.`);
    return;
  }
  if (args.length !== 4 || args[0] !== '--metadata' || args[2] !== '--csv') throw new Error('Use --metadata entry.json --csv deck.csv, or no arguments for the library.');
  const metadata = JSON.parse(readUtf8(path.resolve(args[1])));
  const deck = Core.validateDeck(metadata, readUtf8(path.resolve(args[3])));
  console.log(`Validated ${deck.title}: ${deck.cards.length} cards.`);
}
if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
module.exports = { main };
