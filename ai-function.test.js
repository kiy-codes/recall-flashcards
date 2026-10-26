const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const assert = require('node:assert/strict');
const clientValidation = require('./ai-evaluator');
const UUID = '11111111-2222-4333-8444-555555555555';
const input = { question: 'Define diffusion', expected_answer: 'Net movement from high to low concentration', user_answer: 'Particles move down a concentration gradient', accepted_alternatives: ['Particles spread from higher to lower concentration'], subject: 'Biology', language: 'English', marking_guidance: 'Award key concepts.' };
const result = { result: 'correct', score: 90, feedback: 'Equivalent meaning.', missing_points: [], confidence: 0.9 };
const env = name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', GROQ_API_KEY: 'test-server-key' })[name];
const request = (payload = input, headers = {}) => new Request('https://example.supabase.co/functions/v1/evaluate-answer', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'sb_publishable_public', authorization: 'Bearer user.jwt.token', ...headers }, body: JSON.stringify(payload) });
// Mocked database client for recall_take_ai_appeal: one shared counter per user and hour, like the real table.
const newDb = () => ({ counts: new Map(), hour: 0, down: false });
const rpcUrl = url => url.includes('/rest/v1/rpc/recall_take_ai_appeal');
const fetcher = (calls, groqStatus = 200, groqBody = result, db = newDb()) => async (url, options) => {
  calls.push({ url, options });
  if (url.includes('/auth/v1/user')) return Response.json({ id: UUID });
  if (rpcUrl(url)) {
    if (db.down) return Response.json({ message: 'down' }, { status: 500 });
    const key = `${JSON.parse(options.body).p_user}@${db.hour}`;
    db.counts.set(key, (db.counts.get(key) || 0) + 1);
    return Response.json(db.counts.get(key));
  }
  if (url.includes('/rest/v1/recall_ai_settings')) return Response.json([{ provider: 'groq', model: 'openai/gpt-oss-120b' }]);
  return Response.json({ choices: [{ message: { content: JSON.stringify(groqBody) } }] }, { status: groqStatus });
};

test('server and client agree on request and response validation', async () => {
  const server = await import('./supabase/functions/_shared/evaluator.ts');
  assert.deepEqual(server.validateInput(input), clientValidation.validateInput(input));
  assert.deepEqual(server.validateResult(result), clientValidation.validateResult(result));
  for (const bad of [{ ...input, notes: 'hidden' }, { ...input, user_answer: 'person@example.com' }, { ...input, accepted_alternatives: ['password: bad'] }, { ...input, accepted_alternatives: Array(11).fill('x') }]) {
    assert.throws(() => server.validateInput(bad)); assert.throws(() => clientValidation.validateInput(bad));
  }
});

test('Edge Function verifies user and sends only allowlisted learning text to Groq', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const calls = []; const reply = await handleRequest(request(), { fetcher: fetcher(calls), env });
  assert.equal(reply.status, 200); assert.deepEqual(await reply.json(), result);
  assert.equal(calls.length, 4); assert.match(calls[0].url, /\/auth\/v1\/user$/);
  assert.ok(rpcUrl(calls[2].url)); assert.deepEqual(JSON.parse(calls[2].options.body), { p_user: UUID });
  const groq = JSON.parse(calls[3].options.body);
  assert.equal(groq.model, 'openai/gpt-oss-120b');
  assert.equal(groq.response_format.json_schema.strict, true);
  assert.deepEqual(JSON.parse(groq.messages[1].content), input);
  assert.doesNotMatch(calls[3].options.body, /test-server-key|email|password|private_notes|review_history/);
});

test('Edge Function rejects unauthenticated, oversized and private-looking requests before Groq', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  for (const [req, status] of [[request(input, { authorization: '' }), 401], [request({ ...input, user_answer: 'x'.repeat(701) }), 400], [request({ ...input, notes: 'private' }), 400], [request({ ...input, user_answer: 'person@example.com' }), 400]]) {
    const calls = []; const reply = await handleRequest(req, { fetcher: fetcher(calls), env });
    assert.equal(reply.status, status); assert.equal(calls.filter(call => call.url.includes('api.groq.com') || rpcUrl(call.url)).length, 0);
  }
});

test('Edge Function enforces the per-user hourly limit through the database counter', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const db = newDb(); const calls = [];
  // Separate handleRequest calls with no shared memory stand in for separate function instances.
  for (let index = 0; index < 10; index += 1) assert.equal((await handleRequest(request(), { fetcher: fetcher(calls, 200, result, db), env })).status, 200);
  const before = calls.filter(call => call.url.includes('api.groq.com')).length;
  const blocked = await handleRequest(request(), { fetcher: fetcher(calls, 200, result, db), env });
  assert.equal(blocked.status, 429); assert.match((await blocked.json()).error, /limit reached \(10 per hour\)/);
  assert.equal(calls.filter(call => call.url.includes('api.groq.com')).length, before, 'provider was called after the limit');
  assert.equal(db.counts.get(`${UUID}@0`), 11);
  const rpc = calls.find(call => rpcUrl(call.url)).options;
  assert.equal(rpc.headers.authorization, 'Bearer test-service-key'); assert.equal(rpc.headers.apikey, 'test-service-key');
  db.hour = 1; // a new hour bucket starts a fresh count
  assert.equal((await handleRequest(request(), { fetcher: fetcher(calls, 200, result, db), env })).status, 200);
});

test('Edge Function fails closed when the counter is unavailable and masks Groq errors or malformed output', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const down = newDb(); down.down = true; const calls = [];
  assert.equal((await handleRequest(request(), { fetcher: fetcher(calls, 200, result, down), env })).status, 503);
  assert.equal(calls.filter(call => call.url.includes('api.groq.com')).length, 0);
  for (const bad of [null, 0, 'ten', 1.5]) {
    const odd = async (url, options) => rpcUrl(url) ? Response.json(bad) : fetcher([])(url, options);
    assert.equal((await handleRequest(request(), { fetcher: odd, env })).status, 503);
  }
  assert.equal((await handleRequest(request(), { fetcher: fetcher([], 429), env })).status, 429);
  const malformed = await handleRequest(request(), { fetcher: fetcher([], 200, { ...result, result: 'maybe' }), env });
  assert.equal(malformed.status, 503); assert.doesNotMatch(JSON.stringify(await malformed.json()), /test-server-key/);
});

test('protected database selection overrides optional legacy GROQ_MODEL secret', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const calls = [];
  const reply = await handleRequest(request(), { fetcher: fetcher(calls), env: name => name === 'GROQ_MODEL' ? 'openai/gpt-oss-20b' : env(name) });
  assert.equal(reply.status, 200);
  assert.equal(JSON.parse(calls[3].options.body).model, 'openai/gpt-oss-120b');
  assert.equal(reply.headers.get('cache-control'), 'no-store');
});

test('optional GROQ_MODEL is an allowlisted fallback only when no settings row exists', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const calls = [];
  const noRow = async (url, options) => url.includes('/rest/v1/recall_ai_settings') ? Response.json([]) : fetcher(calls)(url, options);
  const chosen = await handleRequest(request(), { fetcher: noRow, env: name => name === 'GROQ_MODEL' ? 'openai/gpt-oss-20b' : env(name) });
  assert.equal(chosen.status, 200);
  assert.equal(JSON.parse(calls.find(call => call.url.includes('api.groq.com')).options.body).model, 'openai/gpt-oss-20b');
  const invalid = await handleRequest(request(), { fetcher: noRow, env: name => name === 'GROQ_MODEL' ? 'unapproved' : env(name) });
  assert.equal(invalid.status, 503);
});

test('multilingual appeals fit within the request cap and limits are scoped by user', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const multilingual = { ...input, question: '水'.repeat(700), expected_answer: '水'.repeat(700), user_answer: '水'.repeat(700), accepted_alternatives: ['水'.repeat(200)] };
  assert.equal((await handleRequest(request(multilingual), { fetcher: fetcher([]), env })).status, 200);
  const db = newDb(); db.counts.set(`${UUID}@0`, 10);
  assert.equal((await handleRequest(request(), { fetcher: fetcher([], 200, result, db), env })).status, 429);
  const secondUser = async (url, options) => url.includes('/auth/v1/user') ? Response.json({ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }) : fetcher([], 200, result, db)(url, options);
  assert.equal((await handleRequest(request(), { fetcher: secondUser, env })).status, 200);
});

test('the Postgres counter is atomic, per user and hour, and closed to clients', async () => {
  const db = new PGlite();
  const first = '11111111-1111-4111-8111-111111111111'; const second = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create schema auth; create table auth.users (id uuid primary key);
      insert into auth.users values ('${first}'), ('${second}');
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      grant usage on schema auth, public to authenticated, anon, service_role;
    `);
    const sql = fs.readFileSync(path.join(__dirname, 'supabase/schema.sql'), 'utf8');
    await db.exec(sql); await db.exec(sql);
    const take = async id => (await db.query('select public.recall_take_ai_appeal($1) as n', [id])).rows[0].n;
    assert.deepEqual([await take(first), await take(first), await take(second), await take(first)], [1, 2, 1, 3]);
    await db.exec('set role service_role');
    assert.equal(await take(first), 4);
    await assert.rejects(db.query('select * from public.recall_ai_appeal_usage'), /permission denied/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('reset role'); await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from public.recall_ai_appeal_usage'), /permission denied/);
      await assert.rejects(db.query('select public.recall_take_ai_appeal($1)', [first]), /permission denied/);
    }
    await db.exec('reset role');
    const rows = (await db.query("select user_id, count, date_trunc('hour', window_start) = window_start as aligned from public.recall_ai_appeal_usage order by user_id")).rows;
    assert.deepEqual(rows.map(row => [row.user_id, row.count, row.aligned]), [[first, 4, true], [second, 1, true]]);
  } finally { await db.close(); }
});
