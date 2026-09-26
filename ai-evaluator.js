(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./metadata-utils') : root.RecallMetadata);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RecallAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Metadata) {
  'use strict';
  const MAX_ANSWER_LENGTH = 700;
  const LIMITS = { question: 700, expected_answer: 700, user_answer: MAX_ANSWER_LENGTH, subject: 100, language: 100, marking_guidance: 300 };
  const FIELDS = [...Object.keys(LIMITS), 'accepted_alternatives'];
  const RESULTS = ['correct', 'partially_correct', 'incorrect'];
  const email = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
  const secretLabel = /\b(?:password|passphrase|api[_ -]?key|secret[_ -]?key|private[_ -]?key|service[_ -]?role)\s*[:=]/i;

  function validateInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !FIELDS.includes(key))) throw new Error('Invalid evaluation request.');
    const result = {};
    for (const key of FIELDS) {
      if (key === 'accepted_alternatives') continue;
      const text = value[key];
      if (typeof text !== 'string' || text.length > LIMITS[key] || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || email.test(text) || secretLabel.test(text)) throw new Error('Evaluation text is invalid or contains private-looking data.');
      result[key] = text.trim();
    }
    if (!Array.isArray(value.accepted_alternatives) || value.accepted_alternatives.length > 10 || value.accepted_alternatives.some(item => typeof item !== 'string' || !item.trim() || item.length > 200 || /[\x00-\x1f]/.test(item) || email.test(item) || secretLabel.test(item)) || value.accepted_alternatives.join('').length > 700) throw new Error('Invalid accepted alternatives.');
    result.accepted_alternatives = value.accepted_alternatives.map(item => item.trim());
    if (!result.question || !result.expected_answer || !result.user_answer) throw new Error('Question and answers are required.');
    return result;
  }

  function validateResult(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'confidence,feedback,missing_points,result,score') throw new Error('Invalid AI response.');
    if (!RESULTS.includes(value.result) || !Number.isInteger(value.score) || value.score < 0 || value.score > 100 || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new Error('Invalid AI response.');
    if (value.result === 'correct' && value.score < 80 || value.result === 'partially_correct' && (value.score < 1 || value.score >= 80) || value.result === 'incorrect' && value.score >= 50) throw new Error('Inconsistent AI score.');
    if (typeof value.feedback !== 'string' || !value.feedback.trim() || value.feedback.length > 180 || /[\x00-\x1f]/.test(value.feedback)) throw new Error('Invalid AI feedback.');
    if (!Array.isArray(value.missing_points) || value.missing_points.length > 5 || value.missing_points.some(point => typeof point !== 'string' || !point.trim() || point.length > 120 || /[\x00-\x1f]/.test(point))) throw new Error('Invalid AI missing points.');
    return { result: value.result, score: value.score, feedback: value.feedback.trim(), missing_points: value.missing_points.map(point => point.trim()), confidence: value.confidence };
  }

  function localResult(local, unavailable = '') {
    return { result: local.accepted ? 'correct' : 'incorrect', score: local.accepted ? 100 : 0, feedback: local.classification === 'typo' ? 'Accepted with a small typo.' : local.accepted ? 'Accepted by local matching.' : 'Not matched by local checks.', missing_points: [], confidence: 1, source: 'local', classification: local.classification, unavailable };
  }

  function shouldAskAI(local, input) {
    if (local.accepted || !input.user_answer || input.user_answer.length > MAX_ANSWER_LENGTH) return false;
    const expected = Metadata.normaliseAnswer(input.expected_answer);
    const actual = Metadata.normaliseAnswer(input.user_answer);
    if (!expected || !actual) return false;
    // Distinct numbers are unambiguous; no model call is useful.
    if (/^-?\d+(?:\.\d+)?$/.test(expected) && /^-?\d+(?:\.\d+)?$/.test(actual)) return false;
    return true;
  }

  async function evaluate({ question, expected, answer, alternatives = [], subject = '', language = '', guidance = '', enabled = false, client = null }) {
    const local = Metadata.evaluateTypedAnswer(answer, expected, alternatives);
    const fallback = reason => localResult(local, reason);
    if (!enabled) return fallback('');
    const input = appealInput({ question, expected, answer, alternatives, subject, language, guidance });
    if (!shouldAskAI(local, input)) return fallback('');
    try { validateInput(input); } catch { return fallback('AI skipped for private-looking or overlong text.'); }
    if (!client) return fallback('AI is unavailable; evaluated locally.');
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) return fallback('Sign in to use AI; evaluated locally.');
      const { data, error } = await client.functions.invoke('evaluate-answer', { body: input, signal: AbortSignal.timeout(8000) });
      if (error) return fallback(error.context?.status === 429 ? 'AI limit reached; evaluated locally.' : 'AI is unavailable; evaluated locally.');
      return { ...validateResult(data), source: 'ai', classification: 'ai', unavailable: '' };
    } catch { return fallback('AI is unavailable; evaluated locally.'); }
  }

  function appealInput({ question, expected, answer, alternatives = [], subject = '', language = '', guidance = '' }) {
    return { question: String(question || ''), expected_answer: String(expected || ''), user_answer: String(answer || ''), accepted_alternatives: alternatives, subject: String(subject || ''), language: String(language || ''), marking_guidance: String(guidance || '') };
  }

  async function appeal({ local, client = null, ...fields }) {
    if (!local || !['incorrect', 'partially_correct'].includes(local.result)) throw new Error('Only an unresolved local result can be appealed.');
    let input;
    try { input = validateInput(appealInput(fields)); }
    catch { return { status: 'unavailable', reason: 'AI unavailable — original local result kept', ai: null }; }
    if (!client) return { status: 'unavailable', reason: 'AI unavailable — original local result kept', ai: null };
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) return { status: 'unavailable', reason: 'AI unavailable — original local result kept. Sign in to appeal.', ai: null };
      const { data, error } = await client.functions.invoke('evaluate-answer', { body: input, signal: AbortSignal.timeout(8000) });
      if (error) return { status: 'unavailable', reason: error.context?.status === 429 ? 'AI unavailable — original local result kept. Appeal limit reached.' : 'AI unavailable — original local result kept', ai: null };
      const ai = validateResult(data);
      return { status: ai.result === 'correct' ? 'accepted' : ai.result === 'partially_correct' ? 'partially_accepted' : 'rejected', reason: '', ai };
    } catch { return { status: 'unavailable', reason: 'AI unavailable — original local result kept', ai: null }; }
  }

  return { MAX_ANSWER_LENGTH, validateInput, validateResult, shouldAskAI, localResult, evaluate, appeal };
});
