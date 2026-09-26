const test = require('node:test');
const assert = require('node:assert/strict');
const clientValidation = require('./ai-evaluator');
const UUID = '11111111-2222-4333-8444-555555555555';
const input = { question: 'Define diffusion', expected_answer: 'Net movement from high to low concentration', user_answer: 'Particles move down a concentration gradient', accepted_alternatives: ['Particles spread from higher to lower concentration'], subject: 'Biology', language: 'English', marking_guidance: 'Award key concepts.' };
const result = { result: 'correct', score: 90, feedback: 'Equivalent meaning.', missing_points: [], confidence: 0.9 };
const env = name => ({ SUPABASE_URL: 'https://example.supabase.co', GROQ_API_KEY: 'test-server-key' })[name];
const request = (payload = input, headers = {}) => new Request('https://example.supabase.co/functions/v1/evaluate-answer', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'sb_publishable_public', authorization: 'Bearer user.jwt.token', ...headers }, body: JSON.stringify(payload) });
const fetcher = (calls, groqStatus = 200, groqBody = result) => async (url, options) => {
  calls.push({ url, options });
  if (url.includes('/auth/v1/user')) return Response.json({ id: UUID });
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
  const calls = []; const reply = await handleRequest(request(), { fetcher: fetcher(calls), env, rateState: new Map() });
  assert.equal(reply.status, 200); assert.deepEqual(await reply.json(), result);
  assert.equal(calls.length, 2); assert.match(calls[0].url, /\/auth\/v1\/user$/);
  const groq = JSON.parse(calls[1].options.body);
  assert.equal(groq.model, 'openai/gpt-oss-120b');
  assert.equal(groq.response_format.json_schema.strict, true);
  assert.deepEqual(JSON.parse(groq.messages[1].content), input);
  assert.doesNotMatch(calls[1].options.body, /test-server-key|email|password|private_notes|review_history/);
});

test('Edge Function rejects unauthenticated, oversized and private-looking requests before Groq', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  for (const [req, status] of [[request(input, { authorization: '' }), 401], [request({ ...input, user_answer: 'x'.repeat(701) }), 400], [request({ ...input, notes: 'private' }), 400], [request({ ...input, user_answer: 'person@example.com' }), 400]]) {
    const calls = []; const reply = await handleRequest(req, { fetcher: fetcher(calls), env, rateState: new Map() });
    assert.equal(reply.status, status); assert.equal(calls.filter(call => call.url.includes('api.groq.com')).length, 0);
  }
});

test('Edge Function enforces per-user limit and masks Groq errors or malformed output', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const rateState = new Map(); const calls = [];
  for (let index = 0; index < 10; index += 1) assert.equal((await handleRequest(request(), { fetcher: fetcher(calls), env, rateState, now: () => 1000 })).status, 200);
  assert.equal((await handleRequest(request(), { fetcher: fetcher(calls), env, rateState, now: () => 1000 })).status, 429);
  assert.equal((await handleRequest(request(), { fetcher: fetcher([] , 429), env, rateState: new Map() })).status, 429);
  const malformed = await handleRequest(request(), { fetcher: fetcher([], 200, { ...result, result: 'maybe' }), env, rateState: new Map() });
  assert.equal(malformed.status, 503); assert.doesNotMatch(JSON.stringify(await malformed.json()), /test-server-key/);
});

test('Edge Function uses an explicitly configured server-side model without exposing the key', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const calls = [];
  const reply = await handleRequest(request(), { fetcher: fetcher(calls), env: name => name === 'GROQ_MODEL' ? 'openai/gpt-oss-20b' : env(name), rateState: new Map() });
  assert.equal(reply.status, 200);
  assert.equal(JSON.parse(calls[1].options.body).model, 'openai/gpt-oss-20b');
  assert.equal(reply.headers.get('cache-control'), 'no-store');
});

test('multilingual appeals fit within the request cap and limits are scoped by user', async () => {
  const { handleRequest } = await import('./supabase/functions/evaluate-answer/index.ts');
  const multilingual = { ...input, question: '水'.repeat(700), expected_answer: '水'.repeat(700), user_answer: '水'.repeat(700), accepted_alternatives: ['水'.repeat(200)] };
  assert.equal((await handleRequest(request(multilingual), { fetcher: fetcher([]), env, rateState: new Map() })).status, 200);
  const rateState = new Map([[UUID, { start: 1000, count: 10 }]]);
  const secondUser = async (url, options) => url.includes('/auth/v1/user') ? Response.json({ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }) : fetcher([])(url, options);
  assert.equal((await handleRequest(request(), { fetcher: secondUser, env, rateState, now: () => 1000 })).status, 200);
});
