(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecallShareCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const text = (value, max) => String(value || '').trim().slice(0, max);
  const tags = value => Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 30).map(item => text(item, 100)).filter(Boolean) : [];
  function snapshotDeck(deck) {
    if (!deck || typeof deck !== 'object' || !Array.isArray(deck.cards) || deck.cards.length > 2000) throw new Error('This deck cannot be shared. A link can contain at most 2,000 cards.');
    const snapshot = {
      name: text(deck.name, 70), subject: text(deck.subject, 100) || 'General',
      domain: ['language', 'science', 'history', 'medicine', 'law', 'other'].includes(deck.domain) ? deck.domain : 'other',
      language: deck.language && typeof deck.language === 'object' ? { code: text(deck.language.code, 20), name: text(deck.language.name, 100) } : null,
      tags: tags(deck.tags), frontLabel: text(deck.frontLabel, 40) || 'First side', backLabel: text(deck.backLabel, 40) || 'Second side',
      cards: deck.cards.map(card => ({
        front: text(card.front, 700), back: text(card.back, 700),
        acceptedAnswers: tags(card.acceptedAnswers),
        wordInfo: {
          gender: text(card.wordInfo?.gender, 30) || 'unknown',
          originalMarker: text(card.wordInfo?.originalMarker, 80) || null,
          partOfSpeech: text(card.wordInfo?.partOfSpeech, 100) || null,
        },
      })),
    };
    if (!snapshot.name || snapshot.cards.some(card => !card.front || !card.back)) throw new Error('A shared deck needs a name and two sides on every card.');
    if (new TextEncoder().encode(JSON.stringify(snapshot)).length > 1048576) throw new Error('This deck is too large for a share link (1 MiB maximum).');
    return snapshot;
  }
  function validateSnapshot(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.cards)) throw new Error('This share has invalid deck data.');
    const clean = snapshotDeck(value);
    // Reject malformed or augmented server responses instead of ever copying
    // private fields from an untrusted source.
    return clean;
  }
  function copyDeck(snapshot, makeId) {
    const deck = validateSnapshot(snapshot);
    return {
      ...deck, id: makeId(), cards: deck.cards.map(card => ({
        ...card, id: makeId(), state: 'New', flagged: false, missed: false,
        correctStreak: 0, reviewCount: 0, notes: '', hint: '',
        wordInfo: { ...card.wordInfo, language: deck.language },
      })),
    };
  }
  const validToken = value => /^[a-f0-9]{64}$/.test(String(value || ''));
  function newToken(cryptoApi = globalThis.crypto) {
    const bytes = new Uint8Array(32); cryptoApi.getRandomValues(bytes);
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function tokenFromInput(value) {
    const input = String(value || '').trim();
    let token = input;
    try { const url = new URL(input); token = new URLSearchParams(url.hash.replace(/^#/, '')).get('share') || url.searchParams.get('share') || ''; } catch { /* plain share code */ }
    if (!validToken(token)) throw new Error('Enter a valid Recall share code or link.');
    return token;
  }
  return { snapshotDeck, validateSnapshot, copyDeck, validToken, newToken, tokenFromInput };
});
