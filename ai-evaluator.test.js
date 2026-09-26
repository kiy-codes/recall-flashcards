const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('./ai-evaluator');
const { scoreTest } = require('./test-utils');

const base = { question: 'Define osmosis', expected: 'Movement of water across a partially permeable membrane from high to low water potential', answer: 'Water moves through a semipermeable membrane down its water potential gradient', subject: 'Biology', language: 'English', guidance: 'Use key scientific concepts.' };
const response = { result: 'correct', score: 95, feedback: 'Same key concepts in different words.', missing_points: [], confidence: 0.95 };
const client = (reply = response, calls = []) => ({
  auth: { getSession: async () => ({ data: { session: { access_token: 'user-jwt' } }, error: null }) },
  functions: { invoke: async (name, options) => { calls.push({ name, options }); return { data: reply, error: null }; } },
});

test('exact, accepted alternative, and typo checks never call AI', async () => {
  const calls = []; const cloud = client(response, calls);
  for (const [answer, alternatives] of [['Water', []], ['Aqua', ['aqua']], ['Wate', []]]) {
    const result = await AI.evaluate({ ...base, question: 'Translate water', expected: 'Water', answer, alternatives, enabled: true, client: cloud });
    assert.equal(result.source, 'local'); assert.equal(result.result, 'correct');
  }
  assert.equal(calls.length, 0);
});

test('science meaning is sent only after local uncertainty and only with allowed fields', async () => {
  const calls = []; const result = await AI.evaluate({ ...base, enabled: true, client: client(response, calls) });
  assert.equal(result.source, 'ai'); assert.equal(result.result, 'correct'); assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'evaluate-answer');
  assert.deepEqual(Object.keys(calls[0].options.body).sort(), ['accepted_alternatives', 'expected_answer', 'language', 'marking_guidance', 'question', 'subject', 'user_answer']);
  assert.doesNotMatch(JSON.stringify(calls[0].options.body), /notes|history|email|password|deck_id/i);
});

test('partial science score contributes fractional test credit', async () => {
  const partial = { result: 'partially_correct', score: 50, feedback: 'Mentions water movement but omits the membrane.', missing_points: ['partially permeable membrane'], confidence: 0.8 };
  const result = await AI.evaluate({ ...base, enabled: true, client: client(partial) });
  assert.equal(result.result, 'partially_correct'); assert.equal(result.score, 50);
  assert.deepEqual({ percentage: scoreTest({ questions: [{}, {}], answers: [{ result: 'correct' }, result] }).percentage }, { percentage: 75 });
});

test('incorrect and multilingual language results are accepted only after validation', async () => {
  const calls = [];
  const result = await AI.evaluate({ question: 'Translate house', expected: 'Haus', answer: 'casa', subject: 'German', language: 'German', guidance: 'Judge German meaning.', enabled: true, client: client({ result: 'incorrect', score: 0, feedback: 'This is Spanish, not German.', missing_points: ['German translation'], confidence: 0.99 }, calls) });
  assert.equal(result.result, 'incorrect'); assert.equal(calls[0].options.body.language, 'German');
});

test('malformed responses, unavailable AI, sign-out and private-looking text fall back locally', async () => {
  for (const cloud of [client({ result: 'correct' }), { ...client(), functions: { invoke: async () => ({ data: null, error: { context: { status: 429 } } }) } }, { ...client(), auth: { getSession: async () => ({ data: { session: null } }) } }]) {
    const result = await AI.evaluate({ ...base, enabled: true, client: cloud });
    assert.equal(result.source, 'local'); assert.equal(result.result, 'incorrect'); assert.match(result.unavailable, /locally|Sign in/);
  }
  const privateText = await AI.evaluate({ ...base, answer: 'person@example.com', enabled: true, client: client() });
  assert.equal(privateText.source, 'local'); assert.match(privateText.unavailable, /private-looking/);
  assert.throws(() => AI.validateResult({ ...response, score: 101 }));
  assert.throws(() => AI.validateInput({ ...{ question: base.question, expected_answer: base.expected, user_answer: 'x'.repeat(701), accepted_alternatives: [], subject: '', language: '', marking_guidance: '' } }));
});

test('appeals are opt-in, preserve the local result, and send the seven allowed fields', async () => {
  const calls = []; const local = { result: 'incorrect', score: 0 };
  const appeal = await AI.appeal({ ...base, local, alternatives: ['Water travels down a water-potential gradient'], client: client(response, calls) });
  assert.equal(appeal.status, 'accepted'); assert.equal(appeal.ai.result, 'correct'); assert.deepEqual(local, { result: 'incorrect', score: 0 });
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].options.body.accepted_alternatives, ['Water travels down a water-potential gradient']);
  assert.deepEqual(Object.keys(calls[0].options.body).sort(), ['accepted_alternatives', 'expected_answer', 'language', 'marking_guidance', 'question', 'subject', 'user_answer']);
  await assert.rejects(AI.appeal({ ...base, local: { result: 'correct' }, client: client() }));
});

test('partial and rejected appeals do not become full credit', async () => {
  const local = { result: 'incorrect' };
  const partial = await AI.appeal({ ...base, local, client: client({ result: 'partially_correct', score: 55, feedback: 'Water movement is right; the membrane is missing.', missing_points: ['membrane'], confidence: .8 }) });
  assert.equal(partial.status, 'partially_accepted'); assert.equal(partial.ai.score, 55);
  const rejected = await AI.appeal({ ...base, local, client: client({ result: 'incorrect', score: 0, feedback: 'The answer contradicts the expected direction.', missing_points: [], confidence: .9 }) });
  assert.equal(rejected.status, 'rejected'); assert.equal(local.result, 'incorrect');
});

test('malformed, timed-out, unauthenticated and unavailable appeals keep local result', async () => {
  const local = { result: 'incorrect', score: 0 };
  const clients = [
    client({ ...response, result: 'maybe' }),
    { ...client(), functions: { invoke: async () => { throw new Error('timeout'); } } },
    { ...client(), auth: { getSession: async () => ({ data: { session: null } }) } },
    { ...client(), functions: { invoke: async () => ({ data: null, error: { context: { status: 503 } } }) } },
  ];
  for (const cloud of clients) { const appeal = await AI.appeal({ ...base, local, client: cloud }); assert.equal(appeal.status, 'unavailable'); assert.equal(appeal.ai, null); assert.equal(local.result, 'incorrect'); }
  const offline = await AI.appeal({ ...base, local }); assert.equal(offline.status, 'unavailable'); assert.match(offline.reason, /Cloud connection is not configured/);
  const privateAlternative = await AI.appeal({ ...base, local, alternatives: ['person@example.com'], client: client() }); assert.equal(privateAlternative.status, 'unavailable'); assert.match(privateAlternative.reason, /private-looking/);
  const notDeployed = await AI.appeal({ ...base, local, client: { ...client(), functions: { invoke: async () => ({ data: null, error: { context: { status: 404 } } }) } } });
  assert.match(notDeployed.reason, /not deployed/); assert.equal(local.result, 'incorrect');
});
