const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Core = require('./catalog-core');
const Service = require('./catalog-service');
const { loadCatalog } = require('./scripts/catalog');
const { metadata, source, USER, KEY } = require('./tests/catalog-fixtures');
const id = 'web-' + 'a'.repeat(32);

test('publication shares the exact browser/server validator and strips every private field', () => {
  assert.equal(fs.readFileSync('catalog-core.js', 'utf8').replace(/\r/g,''), fs.readFileSync('supabase/functions/_shared/catalog-core.js', 'utf8').replace(/\r/g,''));
  const original = source(), before = structuredClone(original);
  const prepared = Core.preparePublication(metadata(), original);
  assert.deepEqual(original, before);
  assert.deepEqual(Object.keys(prepared.deck).sort(), ['cards','domain','language']);
  assert.deepEqual(Object.keys(prepared.deck.cards[0]).sort(), ['acceptedAnswers','back','front','hint','notes','wordInfo']);
  assert.doesNotMatch(JSON.stringify(prepared), /private|secret|Mastered|reviewCount|correctStreak|flagged|fsrs|dueAt|createdAt|sync/);
  assert.equal(prepared.deck.cards[0].notes, 'Public note');
  original.cards[0].front = 'Edited privately'; assert.equal(prepared.deck.cards[0].front, before.cards[0].front);
});
test('publication enforces qualification, metadata, card and word information limits and duplicates', () => {
  const invalidMetadata = [{ qualification: 'A level' }, { title: '' }, { description: 'x'.repeat(501) }, { version: '01.0.0' }, { verified: 'true' }, { email: 'secret' }];
  for (const values of invalidMetadata) assert.throws(() => Core.preparePublication({ ...metadata(), ...values }, source()));
  for (const card of [null, { front: '', back: 'A' }, { front: 'Q'.repeat(701), back: 'A' }, { front: 'Q', back: 'A', notes: 'n'.repeat(2001) }, { front: 'Q', back: 'A', hint: 'h'.repeat(701) },
    { front: 'Q', back: 'A', acceptedAnswers: Array(31).fill('A') }, { front: 'Q', back: 'A', acceptedAnswers: ['a','A'] }, { front: 'Q', back: 'A', acceptedAnswers: ['a'.repeat(101)] },
    { front: 'Q', back: 'A', wordInfo: { gender: 'invalid' } }, { front: 'Q', back: 'A', wordInfo: { originalMarker: 'm'.repeat(81) } }, { front: 'Q', back: 'A', wordInfo: { partOfSpeech: 'p'.repeat(101) } }]) {
    assert.throws(() => Core.preparePublication(metadata(), { cards: [card] }));
  }
  for (const cards of [[], Array(2001).fill({ front: 'Q', back: 'A' }), [{ front: 'Same question!', back: 'A' }, { front: 'same QUESTION', back: 'B' }],
    [{ front: 'Explain the lifecycle of this particular star', back: 'A' }, { front: 'Explain the lifecycle of this particular star please', back: 'A' }]]) assert.throws(() => Core.preparePublication(metadata(), { cards }));
  assert.throws(() => Core.preparePublication(metadata(), { cards: Array.from({length: 1500}, (_,i) => ({front: `Question ${i}`, back:'a'.repeat(700), notes:'n'.repeat(2000)})) }), /2 MiB/);
});
test('remote catalogue merges without collisions and copies with fresh progress', () => {
  const bundled = loadCatalog(), publication = Core.preparePublication(metadata(), source());
  const snapshot = Core.publicationEntry(publication, id), row = { id, snapshot };
  const merged = Core.mergeCatalogs(bundled, [row]);
  assert.equal(merged.length, bundled.length + 1); assert.equal(merged[0], bundled[0]);
  let count = 0; const copy = Core.copyDeck(merged.at(-1), () => `new-${++count}`);
  assert.equal(copy.cards[0].state, 'New'); assert.equal(copy.cards[0].reviewCount, 0);
  copy.cards[0].notes = 'Local edit'; assert.equal(snapshot.cards[0].notes, 'Public note');
  assert.throws(() => Core.mergeCatalogs([snapshot], [row]), /collision/);
  assert.throws(() => Core.mergeCatalogs(bundled, [{...row, id:'bundled-id'}]));
  assert.throws(() => Core.mergeCatalogs(bundled, [{id, snapshot:{...snapshot,cardCount:2}}]));
  assert.equal(Core.contentKey(publication.deck), Core.contentKey({...publication.deck,cards:publication.deck.cards.toReversed()}));
});
test('catalogue service fails closed on admin access and account changes, but public reads need no session', async () => {
  const calls = []; let admin = false, session = null, failure = false;
  const snapshot = Core.publicationEntry(Core.preparePublication(metadata(), source()), id);
  const client = {
    auth: { getSession: async () => ({data:{session}}), getUser: async () => ({data:{user:session?.user}}) },
    functions: { invoke: async (name, {body}) => { calls.push(body); return {data: body.action==='status'? {authorized:admin}:{id,title:body.metadata.title,version:body.metadata.version,cardCount:body.deck.cards.length,replayed:false}}; } },
    from: name => { assert.equal(name,'recall_catalog_decks'); return {select(fields) { assert.equal(fields,'id,snapshot'); return this; }, order() {return this;}, range() {return this;}, abortSignal: async () => failure ? {error:{}}:{data:[{id,snapshot}]} }; },
  };
  const service = Service.createService(client);
  assert.equal(await service.access(),null); assert.equal(calls.length,0);
  session = {user:{id:USER}}; assert.equal(await service.access(),null); admin = true; assert.equal(await service.access(),USER);
  const publication = {...Core.preparePublication(metadata(),source()),idempotencyKey:KEY};
  await service.publish(publication,USER); assert.equal(calls.at(-1).idempotencyKey,KEY);
  session = null; await assert.rejects(service.publish(publication,USER),/account changed/);
  const bundled = loadCatalog(); assert.equal(Core.mergeCatalogs(bundled,await service.load()).length,bundled.length+1);
  failure = true; await assert.rejects(service.load(),/Bundled decks/); assert.equal(bundled.length,10);
});
test('build manifests include publication files without bundling server secrets or identity', () => {
  const {WEB_FILES} = require('./scripts/build');
  for (const file of ['catalog-service.js','admin-library.js']) {
    assert.ok(WEB_FILES.includes(file)); assert.ok(require('./package.json').build.files.includes(file));
    assert.match(fs.readFileSync('index.html','utf8'),new RegExp(`src="${file}"`));
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/SUPABASE_SERVICE_ROLE_KEY|sb_secret_|innerHTML/);
  }
});
