// @ts-nocheck
const LIMITS = { question: 700, expected_answer: 700, user_answer: 700, subject: 100, language: 100, marking_guidance: 300 };
const FIELDS = [...Object.keys(LIMITS), 'accepted_alternatives'];
const email = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const secretLabel = /\b(?:password|passphrase|api[_ -]?key|secret[_ -]?key|private[_ -]?key|service[_ -]?role)\s*[:=]/i;

export function validateInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !FIELDS.includes(key))) throw new Error('Invalid evaluation request.');
  const result = {};
  for (const key of FIELDS) {
    if (key === 'accepted_alternatives') continue;
    const text = value[key];
    if (typeof text !== 'string' || text.length > LIMITS[key] || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || email.test(text) || secretLabel.test(text)) throw new Error('Invalid evaluation text.');
    result[key] = text.trim();
  }
  if (!Array.isArray(value.accepted_alternatives) || value.accepted_alternatives.length > 10 || value.accepted_alternatives.some(item => typeof item !== 'string' || !item.trim() || item.length > 200 || /[\x00-\x1f]/.test(item) || email.test(item) || secretLabel.test(item)) || value.accepted_alternatives.join('').length > 700) throw new Error('Invalid accepted alternatives.');
  result.accepted_alternatives = value.accepted_alternatives.map(item => item.trim());
  if (!result.question || !result.expected_answer || !result.user_answer) throw new Error('Question and answers are required.');
  return result;
}

export function validateResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'confidence,feedback,missing_points,result,score') throw new Error('Invalid AI response.');
  if (!['correct', 'partially_correct', 'incorrect'].includes(value.result) || !Number.isInteger(value.score) || value.score < 0 || value.score > 100 || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new Error('Invalid AI response.');
  if (value.result === 'correct' && value.score < 80 || value.result === 'partially_correct' && (value.score < 1 || value.score >= 80) || value.result === 'incorrect' && value.score >= 50) throw new Error('Inconsistent AI score.');
  if (typeof value.feedback !== 'string' || !value.feedback.trim() || value.feedback.length > 180 || /[\x00-\x1f]/.test(value.feedback)) throw new Error('Invalid AI feedback.');
  if (!Array.isArray(value.missing_points) || value.missing_points.length > 5 || value.missing_points.some(point => typeof point !== 'string' || !point.trim() || point.length > 120 || /[\x00-\x1f]/.test(point))) throw new Error('Invalid AI missing points.');
  return { result: value.result, score: value.score, feedback: value.feedback.trim(), missing_points: value.missing_points.map(point => point.trim()), confidence: value.confidence };
}
