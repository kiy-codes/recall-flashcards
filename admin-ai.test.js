const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const env = name => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', GROQ_API_KEY: 'groq-secret', NVIDIA_API_KEY: 'nvidia-secret', OPENAI_API_KEY: 'openai-secret', GEMINI_API_KEY: 'gemini-secret' })[name];
const req = (body, auth = true) => new Request('https://example.supabase.co/functions/v1/admin-ai', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'sb_publishable_public', ...(auth ? { authorization: 'Bearer user.jwt.token' } : {}) }, body: JSON.stringify(body) });
const good = { result: 'correct', score: 90, feedback: 'Correct meaning.', missing_points: [], confidence: 0.9 };

function mockFetch(calls, { admin = true, providerStatus = 200, providerBody = null, selected = { provider: 'groq', model: 'openai/gpt-oss-120b' } } = {}) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/auth/v1/user')) return Response.json({ id: USER });
    if (url.includes('/recall_ai_admins')) return Response.json(admin ? [{ user_id: USER }] : []);
    if (url.includes('/recall_ai_settings')) return Response.json(options?.method === 'PATCH' ? [{ ...JSON.parse(options.body) }] : [selected]);
    if (url.includes('/recall_ai_provider_tests')) return Response.json(options?.method === 'PATCH' ? [{ provider: 'groq' }] : [{ provider: 'groq', status: 'not_tested', last_successful_test_at: null }]);
    const body = providerBody ?? (url.includes('generativelanguage') ? { candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] } }] } : { choices: [{ message: { content: JSON.stringify(good) } }] });
    return Response.json(body, { status: providerStatus });
  };
}

test('admin endpoint checks JWT and database role before revealing any setting or testing', async () => {
  const { handleRequest } = await import('./supabase/functions/admin-ai/index.ts');
  const noAuth = await handleRequest(req({ action: 'status' }, false), { fetcher: mockFetch([]), env, rateState: new Map() });
  assert.equal(noAuth.status, 401);
  const calls = [];
  const forbidden = await handleRequest(req({ action: 'status' }), { fetcher: mockFetch(calls, { admin: false }), env, rateState: new Map() });
  assert.equal(forbidden.status, 403);
  assert.equal(calls.some(item => item.url.includes('/recall_ai_settings')), false);
  const blockedTest = await handleRequest(req({ action: 'test', provider: 'groq', model: 'openai/gpt-oss-120b' }), { fetcher: mockFetch([], { admin: false }), env, rateState: new Map() });
  assert.equal(blockedTest.status, 403);
  const status = await handleRequest(req({ action: 'status' }), { fetcher: mockFetch([]), env, rateState: new Map() });
  const data = await status.json();
  assert.equal(status.status, 200);
  assert.equal(data.providers.length, 4);
  assert.equal(data.providers[0].key_configured, true);
  assert.doesNotMatch(JSON.stringify(data), /groq-secret|server-only-key|API_KEY|authorization/i);
});

test('selection and provider/model allowlists reject arbitrary API URLs and models', async () => {
  const { handleRequest } = await import('./supabase/functions/admin-ai/index.ts');
  const { MODELS, validSelection } = await import('./supabase/functions/_shared/providers.ts');
  assert.deepEqual(Object.keys(MODELS), ['groq', 'nvidia', 'openai', 'gemini']);
  for (const value of [{ provider: 'evil', model: 'x' }, { provider: 'groq', model: 'arbitrary' }, { provider: 'gemini', model: 'openai/gpt-oss-120b' }]) {
    assert.equal(validSelection(value), false);
    const calls = [];
    assert.equal((await handleRequest(req({ action: 'select', ...value }), { fetcher: mockFetch(calls), env, rateState: new Map() })).status, 400);
    assert.equal(calls.length, 0);
  }
  const calls = [];
  const saved = await handleRequest(req({ action: 'select', provider: 'gemini', model: 'gemini-3.5-flash-lite' }), { fetcher: mockFetch(calls, { selected: { provider: 'gemini', model: 'gemini-3.5-flash-lite' } }), env, rateState: new Map() });
  assert.equal(saved.status, 200);
  assert.ok(calls.some(item => item.url.includes('/recall_ai_settings') && item.options.method === 'PATCH'));
});

test('test connection uses server-only keys, safe requests, statuses, and limits', async () => {
  const { handleRequest } = await import('./supabase/functions/admin-ai/index.ts');
  const calls = [];
  const passed = await handleRequest(req({ action: 'test', provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct' }), { fetcher: mockFetch(calls), env, rateState: new Map() });
  assert.equal(passed.status, 200);
  const outbound = calls.find(item => item.url.includes('integrate.api.nvidia.com'));
  assert.ok(outbound);
  assert.doesNotMatch(outbound.options.body, /flashcard|answer|email|nvidia-secret/);
  const saved = calls.find(item => item.url.includes('recall_ai_provider_tests') && item.options.method === 'PATCH');
  assert.equal(saved.options.headers.apikey, 'server-only-key');
  assert.equal(JSON.parse(saved.options.body).status, 'working');
  const failed = await handleRequest(req({ action: 'test', provider: 'groq', model: 'openai/gpt-oss-120b' }), { fetcher: mockFetch([], { providerStatus: 500 }), env, rateState: new Map() });
  assert.equal((await failed.json()).working, false);
  const missing = await handleRequest(req({ action: 'test', provider: 'gemini', model: 'gemini-3.5-flash' }), { fetcher: mockFetch([]), env: name => name === 'GEMINI_API_KEY' ? undefined : env(name), rateState: new Map() });
  assert.match((await missing.json()).error, /not configured/);
  const quota = new Map([[`${USER}:test`, { start: 1000, count: 12 }]]);
  assert.equal((await handleRequest(req({ action: 'test', provider: 'groq', model: 'openai/gpt-oss-120b' }), { fetcher: mockFetch([]), env, rateState: quota, now: () => 1000 })).status, 429);
});

test('each provider parses valid answers and rejects malformed replies without exposing secrets', async () => {
  const { callProvider, MODELS } = await import('./supabase/functions/_shared/providers.ts');
  for (const [provider, models] of Object.entries(MODELS)) {
    const calls = [];
    const valid = await callProvider({ provider, model: models[0] }, { question: 'Q', expected_answer: 'A', user_answer: 'B' }, { fetcher: mockFetch(calls), env });
    assert.deepEqual(valid.result, good);
    assert.equal(calls.length, 1);
    assert.doesNotMatch(calls[0].options.body, /secret/);
    const malformed = await callProvider({ provider, model: models[0] }, {}, { fetcher: mockFetch([], { providerBody: {} }), env });
    assert.equal(malformed.status, 503);
    const missing = await callProvider({ provider, model: models[0] }, {}, { fetcher: mockFetch([]), env: () => undefined });
    assert.equal(missing.status, 503);
    const timedOut = await callProvider({ provider, model: models[0] }, {}, { fetcher: async () => { throw new Error('timeout with secret'); }, env });
    assert.equal(timedOut.status, 503);
    assert.doesNotMatch(timedOut.error, /secret/);
  }
});

test('evaluation uses protected selection and preserves local fallback on missing key', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const input = { question: 'Q', expected_answer: 'A', user_answer: 'B', accepted_alternatives: [], subject: 'Science', language: 'English', marking_guidance: '' };
  const request = () => new Request('https://example.supabase.co/functions/v1/evaluate-answer', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'sb_publishable_public', authorization: 'Bearer user.jwt.token' }, body: JSON.stringify(input) });
  const calls = [];
  const selected = { provider: 'gemini', model: 'gemini-3.5-flash-lite' };
  const reply = await handleRequest(request(), { fetcher: mockFetch(calls, { selected }), env, rateState: new Map() });
  assert.equal(reply.status, 200);
  assert.ok(calls.some(item => item.url.includes('generativelanguage.googleapis.com')));
  const missing = await handleRequest(request(), { fetcher: mockFetch([], { selected }), env: name => name === 'GEMINI_API_KEY' ? undefined : env(name), rateState: new Map() });
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /locally/);
});

test('RLS permits only provisioned admins to read or edit global selection', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${USER}'), ('${OTHER}'); create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'; grant usage on schema auth, public to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
    await db.exec(fs.readFileSync(path.join(__dirname, 'supabase/schema.sql'), 'utf8'));
    await db.query('insert into public.recall_ai_admins(user_id) values ($1)', [USER]);
    const asUser = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]); await db.exec('set role authenticated'); };
    await asUser(OTHER);
    assert.equal((await db.query('select * from public.recall_ai_settings')).rows.length, 0);
    assert.equal((await db.query('select * from public.recall_ai_admins')).rows.length, 0);
    assert.equal((await db.query("update public.recall_ai_settings set provider='openai', model='gpt-4.1-mini' returning *")).rows.length, 0);
    await assert.rejects(db.query('insert into public.recall_ai_admins(user_id) values ($1)', [OTHER]), { code: '42501' });
    await assert.rejects(db.query("update public.recall_ai_provider_tests set status='working'"), { code: '42501' });
    await asUser(USER);
    assert.equal((await db.query('select * from public.recall_ai_settings')).rows.length, 1);
    assert.equal((await db.query("update public.recall_ai_settings set provider='openai', model='gpt-4.1-mini' returning model")).rows[0].model, 'gpt-4.1-mini');
    await assert.rejects(db.query("update public.recall_ai_settings set provider='evil', model='x'"), { code: '23514' });
    await assert.rejects(db.query("delete from public.recall_ai_settings"), { code: '42501' });
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.recall_ai_settings'), { code: '42501' });
  } finally { await db.close(); }
});
