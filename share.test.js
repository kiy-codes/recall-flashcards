const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const Core = require('./share-core');
const Service = require('./share-service');

const source = () => ({
  id: 'owner-deck', name: 'Biology', subject: 'Science', domain: 'science',
  tags: ['Cells'], frontLabel: 'Term', backLabel: 'Meaning', accountEmail: 'private@example.com',
  cards: [{ id: 'old-card', front: 'Cell', back: 'The basic unit of life', notes: 'Private note', hint: 'Private hint',
    state: 'Mastered', dueAt: '2027-01-01', reviewCount: 12, missed: true, acceptedAnswers: ['cell'],
    wordInfo: { gender: 'unknown', partOfSpeech: 'noun', private: 'do not share' } }],
});

test('share snapshot exposes only approved content and copying resets identity and progress', () => {
  const snapshot = Core.snapshotDeck(source());
  const encoded = JSON.stringify(snapshot);
  for (const secret of ['private@example.com', 'Private note', 'Private hint', '2027-01-01', 'old-card', 'Mastered', 'do not share']) assert.equal(encoded.includes(secret), false, secret);
  const ids = ['new-deck', 'new-card'];
  const copy = Core.copyDeck(snapshot, () => ids.shift());
  assert.equal(copy.id, 'new-deck');
  assert.equal(copy.cards[0].id, 'new-card');
  assert.equal(copy.cards[0].state, 'New');
  assert.equal(copy.cards[0].reviewCount, 0);
  assert.equal(copy.cards[0].notes, '');
  assert.equal(copy.cards[0].hint, '');
  copy.cards[0].front = 'Changed';
  assert.equal(snapshot.cards[0].front, 'Cell');
});

test('share codes accept plain codes and web links, and reject invalid input', () => {
  const token = Core.newToken(webcrypto);
  assert.equal(token.length, 64);
  assert.equal(Core.tokenFromInput(token), token);
  assert.equal(Core.tokenFromInput(`https://example.test/#share=${token}`), token);
  assert.throws(() => Core.tokenFromInput('short'), /valid Recall share code/);
});

test('create, preview, list and revoke use owner-scoped requests', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const rows = [];
  let currentUser = owner;
  const client = {
    auth: { async getUser() { return { data: { user: currentUser ? { id: currentUser } : null }, error: null }; } },
    from(table) {
      assert.equal(table, 'recall_deck_shares');
      return {
        insert(row) { return { select() { return { async single() { const saved = { ...row, id: 'link-1', created_at: new Date().toISOString(), revoked_at: null }; rows.push(saved); return { data: saved, error: null }; } }; } }; },
        select() {
          const filters = {};
          const query = { eq(key, value) { filters[key] = value; return query; }, then(resolve) { resolve({ data: rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value)), error: null }); } };
          return query;
        },
        update(value) {
          const filters = {};
          const query = { eq(key, expected) { filters[key] = expected; return query; }, is(key, expected) { filters[key] = expected; return query; }, select() { return { async maybeSingle() { const row = rows.find(item => Object.entries(filters).every(([key, expected]) => item[key] === expected)); if (!row || row.owner_id !== currentUser) return { data: null, error: null }; Object.assign(row, value); return { data: { id: row.id }, error: null }; } }; } };
          return query;
        },
      };
    },
    async rpc(name, params) {
      assert.equal(name, 'recall_preview_deck_share');
      const hash = await Service.sha256(params.p_token, webcrypto);
      const row = rows.find(item => item.token_hash === hash && !item.revoked_at && new Date(item.expires_at) > new Date());
      return { data: row?.deck || null, error: null };
    },
  };
  const service = Service.createService(client, webcrypto);
  const created = await service.create(source(), 7);
  assert.equal(created.deck_id, 'owner-deck');
  assert.equal(rows[0].owner_id, owner);
  assert.equal(rows[0].token_hash, await Service.sha256(created.token, webcrypto));
  assert.equal(JSON.stringify(rows[0].deck).includes('Private note'), false);
  assert.equal((await service.list('owner-deck')).length, 1);
  assert.equal((await service.preview(created.token)).deck.cards[0].front, 'Cell');
  currentUser = null;
  await assert.rejects(service.create(source()), /Sign in/);
  currentUser = '22222222-2222-4222-8222-222222222222';
  await assert.rejects(service.revoke(created.id), /does not belong/);
  currentUser = owner;
  await service.revoke(created.id);
  await assert.rejects(service.preview(created.token), /invalid, expired, revoked, or deleted/);
});
