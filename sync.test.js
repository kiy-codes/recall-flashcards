const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./sync-core');
const { createService, friendlyError } = require('./sync-service');
const F = require('./tests/sync-fixtures');

async function harness({ client = F.fakeClient(F.session), initial = F.library(), storage = F.memoryStorage() } = {}) {
  let data = F.copy(initial), replacementCount = 0;
  const local = {
    read: () => F.copy(data),
    replace(next, expected) {
      if (!Core.equal(data, expected)) throw new Error('Local changed');
      storage.setItem(Core.RECOVERY_KEY, JSON.stringify(data));
      data = F.copy(next); replacementCount++;
    },
  };
  const service = createService({ client, local, storage, namespace: 'test-project' });
  await service.start();
  return { service, client, local, storage, get data() { return data; }, set data(value) { data = value; }, get replacements() { return replacementCount; } };
}

test('serialization preserves the existing library shape, metadata and schedules, excluding runtime and auth', () => {
  const source = F.library(); source.access_token = 'must-not-leave'; source.queue = ['transient'];
  const output = Core.serializeLibrary(source);
  assert.deepEqual(output, F.library());
  assert.deepEqual(Core.validateLibrary(output), output);
  assert.equal(output.sets[0].cards[0].nextReviewAt, '2026-09-24T12:00:00.000Z');
});

test('invalid, oversized and dangerous libraries are rejected before replacement', () => {
  for (const change of [v => { v.sets = []; }, v => { v.folders = []; }, v => { v.sets[0].cards.push(v.sets[0].cards[0]); }, v => { v.sets[0].cards[0].back = 4; }, v => { v.activity = { day: null }; }, v => { v.sets[0].tags = 'bad'; }, v => { v.testHistory = [{ answers: [] }]; }, v => { v.sets[0].cards[0].front = 'x'.repeat(Core.MAX_BYTES); }]) {
    const value = F.library(); change(value); assert.throws(() => Core.validateLibrary(value), /Invalid library/);
  }
  const unsafe = F.library(); unsafe.sets[0].word = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => Core.validateLibrary(unsafe), /unsafe property/);
});

test('configuration is optional and rejects privileged keys and non-Supabase endpoints', () => {
  assert.equal(Core.validateConfig().enabled, false);
  const url = 'https://example.supabase.co';
  assert.equal(Core.validateConfig(url, 'sb_publishable_test').enabled, true);
  const jwt = role => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.test';
  assert.equal(Core.validateConfig(url, jwt('anon')).enabled, true);
  for (const key of ['sb_secret_do_not_ship', jwt('service_role'), jwt('authenticated'), 'not-a-key']) assert.throws(() => Core.validateConfig(url, key), /Only a publishable/);
  assert.throws(() => Core.validateConfig('http://example.supabase.co', 'sb_publishable_test'));
  assert.throws(() => Core.validateConfig('https://example.supabase.co.evil.test', 'sb_publishable_test'));
  assert.throws(() => Core.validateConfig(url));
});

test('three-way merge combines separate card edits and retains all review data', () => {
  const base = F.library(); base.sets[0].cards.push({ id: 'card-2', front: 'Hund', back: 'Dog' });
  const local = F.copy(base), cloud = F.copy(base);
  local.sets[0].cards[0].back = 'Home'; cloud.sets[0].cards[1].back = 'Hound';
  local.reviewLog.push({ id: 'review-1', cardId: 'card-1', outcome: 'correct', timestamp: '2026-09-23T12:00:00Z' });
  cloud.reviewLog.push({ id: 'review-2', cardId: 'card-2', outcome: 'retry', timestamp: '2026-09-23T12:01:00Z' });
  const result = Core.mergeLibraries(local, cloud, base);
  assert.equal(result.safe, true);
  assert.deepEqual(result.library.sets[0].cards.map(c => c.back), ['Home', 'Hound']);
  assert.equal(result.library.reviewLog.length, 2);
});

test('merge preserves unopposed deletions and refuses delete-versus-edit conflicts', () => {
  const base = F.library(), local = F.copy(base), cloud = F.copy(base);
  local.sets[0].cards = [];
  assert.equal(Core.mergeLibraries(local, cloud, base).library.sets[0].cards.length, 0);
  cloud.sets[0].cards[0].back = 'Modified';
  assert.equal(Core.mergeLibraries(local, cloud, base).safe, false);
});

test('merge refuses overlapping counters and unknown-history edits, accepts disjoint new decks', () => {
  const base = F.library(), local = F.copy(base), cloud = F.copy(base);
  local.sets[0].cards[0].reviewCount = 2; cloud.sets[0].cards[0].reviewCount = 3;
  assert.equal(Core.mergeLibraries(local, cloud, base).safe, false);
  assert.equal(Core.mergeLibraries(local, cloud).safe, false);
  const newCloud = F.library(); newCloud.sets.push({ id: 'deck-2', name: 'New deck', cards: [], folderId: null });
  assert.equal(Core.mergeLibraries(base, newCloud).safe, true);
});

test('session restoration and local changes never read or write the cloud library automatically', async () => {
  const h = await harness();
  assert.equal(h.service.getState().session.user.email, F.session.user.email);
  h.service.localChanged();
  assert.equal(h.client.calls.length, 0);
  assert.equal(h.replacements, 0);
});

test('sign-up, confirmation, auth errors and local-scope sign-out preserve the library', async () => {
  const h = await harness({ client: F.fakeClient() });
  const original = F.copy(h.data);
  h.client.confirmEmail = true;
  await h.service.authenticate('signup', 'new@example.test', 'password');
  assert.match(h.service.getState().status, /Check your email/);
  h.client.authError = { code: 'invalid_credentials' };
  await assert.rejects(h.service.authenticate('signin', 'x@example.test', 'wrong'));
  assert.match(h.service.getState().error, /incorrect/);
  h.client.authError = null;
  await h.service.authenticate('signin', F.session.user.email, 'password');
  await h.service.signOut();
  assert.equal(h.service.getState().session, null);
  assert.deepEqual(h.client.calls.at(-1).options, { scope: 'local' });
  assert.deepEqual(h.data, original);
});

test('first upload requires an explicit choice and uses the authenticated user', async () => {
  const h = await harness(); const plan = await h.service.prepare('upload');
  assert.equal(h.client.rows.size, 0);
  await h.service.resolve(plan, 'local');
  assert.deepEqual(h.client.rows.get('user-1').library, h.data);
  assert.equal(h.service.getState().lastSync !== null, true);
  assert.equal(h.replacements, 0);
  assert.equal(h.client.calls[1].operation, 'insert');
});

test('downloads offer keep local and cancel without touching either copy', async () => {
  const h = await harness(); const cloud = F.library(); cloud.sets[0].name = 'Cloud'; h.client.seed('user-1', cloud);
  for (const choice of ['cancel', 'local']) {
    await h.service.resolve(await h.service.prepare('download'), choice);
    assert.equal(h.data.sets[0].name, 'German'); assert.equal(h.client.rows.get('user-1').library.sets[0].name, 'Cloud');
  }
  assert.equal(h.replacements, 0);
});

test('use cloud saves a recovery copy and replaces local only after review', async () => {
  const h = await harness(), original = F.copy(h.data), cloud = F.library(); cloud.sets[0].name = 'Cloud'; h.client.seed('user-1', cloud);
  const plan = await h.service.prepare('download'); assert.deepEqual(h.data, original);
  const result = await h.service.resolve(plan, 'cloud');
  assert.equal(result.localChanged, true); assert.deepEqual(h.data, cloud);
  assert.deepEqual(JSON.parse(h.storage.getItem(Core.RECOVERY_KEY)), original);
});

test('concurrent upload after preview fails the revision check without overwriting', async () => {
  const h = await harness(); const cloud = F.library(); cloud.sets[0].name = 'Old'; h.client.seed('user-1', cloud);
  const plan = await h.service.prepare('upload');
  cloud.sets[0].name = 'New on another device'; h.client.seed('user-1', cloud, 2);
  await assert.rejects(h.service.resolve(plan, 'local'), { code: 'conflict' });
  assert.equal(h.client.rows.get('user-1').library.sets[0].name, 'New on another device');
  assert.equal(h.replacements, 0);
});

test('simultaneous first uploads conflict instead of blind upsert', async () => {
  const h = await harness(); const plan = await h.service.prepare('upload'); h.client.seed('user-1', F.library());
  await assert.rejects(h.service.resolve(plan, 'local'), { code: 'conflict' });
});

test('cloud changes and delete/recreate with the same revision invalidate a download', async () => {
  const h = await harness(); const cloud = F.library(); cloud.sets[0].name = 'Cloud'; h.client.seed('user-1', cloud);
  const plan = await h.service.prepare('download'); h.client.seed('user-1', cloud, 1);
  await assert.rejects(h.service.resolve(plan, 'cloud'), { code: 'conflict' }); assert.equal(h.replacements, 0);
});

test('local edits after preview and during download are never overwritten', async () => {
  const h = await harness(); const cloud = F.library(); cloud.sets[0].name = 'Cloud'; h.client.seed('user-1', cloud);
  let plan = await h.service.prepare('download'); h.data.sets[0].name = 'New local';
  await assert.rejects(h.service.resolve(plan, 'cloud'), { code: 'local_changed' });
  plan = await h.service.prepare('download');
  h.client.beforeQuery = async () => { h.data.sets[0].name = 'Edit during request'; };
  await assert.rejects(h.service.resolve(plan, 'cloud'), /Local changed/);
  assert.equal(h.data.sets[0].name, 'Edit during request'); assert.equal(h.replacements, 0);
});

test('safe merge can update both copies and records a fresh baseline', async () => {
  const h = await harness(); await h.service.resolve(await h.service.prepare('upload'), 'local');
  const cloud = F.copy(h.data); cloud.sets[0].cards.push({ id: 'cloud-card', front: 'C', back: 'D' });
  h.client.seed('user-1', cloud, 2); h.data.sets[0].cards.push({ id: 'local-card', front: 'A', back: 'B' });
  const plan = await h.service.prepare('upload'); assert.equal(plan.conflict, true); assert.equal(plan.merge.safe, true);
  await h.service.resolve(plan, 'merge'); assert.equal(h.data.sets[0].cards.length, 3);
  assert.deepEqual(h.data, h.client.rows.get('user-1').library);
});

test('account switching invalidates previews and metadata is scoped per user and project', async () => {
  const h = await harness(); await h.service.resolve(await h.service.prepare('upload'), 'local');
  h.data.sets[0].name = 'Changed'; const plan = await h.service.prepare('upload');
  h.client.setSession({ user: { id: 'user-2', email: 'other@example.test' } });
  assert.equal(h.service.getState().lastSync, null);
  await assert.rejects(h.service.resolve(plan, 'local'), { code: 'account_changed' });
  assert.equal(h.client.rows.has('user-2'), false);
});

test('sign-out during an outstanding request prevents local replacement', async () => {
  const h = await harness(); const cloud = F.library(); cloud.sets[0].name = 'Cloud'; h.client.seed('user-1', cloud);
  const plan = await h.service.prepare('download'); h.client.beforeQuery = () => h.client.setSession(null);
  await assert.rejects(h.service.resolve(plan, 'cloud'), { code: 'account_changed' }); assert.equal(h.replacements, 0);
});

test('offline, malformed response and full storage failures preserve the local library', async () => {
  const h = await harness(), original = F.copy(h.data);
  h.client.requestError = new TypeError('Failed to fetch');
  await assert.rejects(h.service.prepare('download')); assert.match(h.service.getState().error, /unreachable/);
  h.client.requestError = null; h.client.seed('user-1', { sets: [] });
  await assert.rejects(h.service.prepare('download'), /Invalid library/);
  const cloud = F.library(); cloud.sets[0].name = 'Cloud'; h.client.seed('user-1', cloud);
  const plan = await h.service.prepare('download');
  h.storage.setItem = () => { throw new Error('Storage is full'); };
  await assert.rejects(h.service.resolve(plan, 'cloud'), /Storage is full/);
  assert.deepEqual(h.data, original);
});

test('unknown and expired sessions surface actionable errors without echoing server data', () => {
  assert.match(friendlyError({ code: 'refresh_token_not_found' }), /Sign in again/);
  assert.match(friendlyError({ code: 'PGRST205' }), /SQL/);
  assert.match(friendlyError({ code: '42501' }), /policies/);
  assert.match(friendlyError({ code: 'email_address_not_authorized' }), /project-team/);
  assert.doesNotMatch(friendlyError({ message: 'secret supplied by server' }), /secret/);
});

test('merge refuses equal activity counters produced by different reviews', () => {
  const base = F.library(), local = F.copy(base), cloud = F.copy(base);
  local.activity['2026-09-23'] = { reviewed: 1, learned: 0 };
  cloud.activity['2026-09-23'] = { reviewed: 1, learned: 0 };
  local.reviewLog = [{ id: 'first', cardId: 'card-1' }];
  cloud.reviewLog = [{ id: 'second', cardId: 'card-1' }];
  assert.equal(Core.mergeLibraries(local, cloud, base).safe, false);
});

test('merge keeps local preferences even when only cloud changed', () => {
  const base = F.library(), cloud = F.copy(base); cloud.theme = 'dark';
  const merged = Core.mergeLibraries(base, cloud, base);
  assert.equal(merged.safe, true); assert.equal(merged.library.theme, 'system');
});

test('local changes while uploading remain local and are reported as pending', async () => {
  const h = await harness(); const plan = await h.service.prepare('upload');
  h.client.beforeQuery = () => { h.data.sets[0].name = 'Newer local'; };
  await h.service.resolve(plan, 'local');
  assert.equal(h.data.sets[0].name, 'Newer local');
  assert.equal(h.client.rows.get('user-1').library.sets[0].name, 'German');
  assert.match(h.service.getState().status, /Newer local changes/);
});
