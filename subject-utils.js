(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RecallSubjects = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const PRESET_COLOURS = ['#2447c2', '#3c9a88', '#a56b1d', '#7955ad', '#bc5b55', '#437cba'];
  const parseSubjectTag = tag => { const text = String(tag || '').trim(); const index = text.indexOf(':'); if (index < 1) return null; const subject = text.slice(0, index).trim(); const topic = text.slice(index + 1).trim(); return subject && topic ? { subject, topic } : null; };
  const subjectsForCards = cards => Array.from(new Set((cards || []).flatMap(card => (card.tags || []).map(parseSubjectTag).filter(Boolean).map(item => item.subject))));
  const subjectsForDeck = deck => deck?.subject ? [String(deck.subject).trim()] : Array.from(new Set([...(deck?.tags || []), ...(deck?.cards || []).flatMap(card => card.tags || [])].map(parseSubjectTag).filter(Boolean).map(item => item.subject)));
  const primarySubject = (deck, subjects = subjectsForDeck(deck)) => { const chosen = String(deck?.subject || deck?.primarySubject || '').trim(); if (chosen && subjects.includes(chosen)) return { subject: chosen, fallback: false }; return { subject: subjects[0] || null, fallback: Boolean(chosen && !subjects.includes(chosen)) }; };
  const colourForSubject = (subject, colours = {}) => { if (!subject) return null; const custom = colours[subject]; if (/^#[0-9a-f]{6}$/i.test(custom || '')) return custom; let value = 0; for (const char of subject) value = (value * 31 + char.charCodeAt(0)) >>> 0; return PRESET_COLOURS[value % PRESET_COLOURS.length]; };
  const accentForDeck = (deck, colours = {}) => { const resolved = primarySubject(deck, subjectsForDeck(deck)); return { ...resolved, colour: colourForSubject(resolved.subject, colours) }; };
  const saveColours = colours => JSON.stringify(Object.fromEntries(Object.entries(colours || {}).filter(([, value]) => /^#[0-9a-f]{6}$/i.test(value || ''))));
  const loadColours = value => { try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed && typeof parsed === 'object' ? Object.fromEntries(Object.entries(parsed).filter(([, colour]) => /^#[0-9a-f]{6}$/i.test(colour || ''))) : {}; } catch { return {}; } };
  return { PRESET_COLOURS, parseSubjectTag, subjectsForCards, subjectsForDeck, primarySubject, colourForSubject, accentForDeck, saveColours, loadColours };
});
