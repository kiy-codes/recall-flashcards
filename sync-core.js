(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RecallSyncCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'recall-library-v2';
  const RECOVERY_KEY = 'recall-library-before-cloud-v1';
  const MAX_BYTES = 2 * 1024 * 1024;
  const FIELDS = ['sets', 'folders', 'activeSetId', 'sessionHistory', 'testHistory', 'reviewLog', 'currentSession', 'activity', 'shuffled', 'repeatMissed', 'studyFilter', 'studyMode', 'theme', 'keybinds', 'subjectColors'];
  const PREFERENCES = new Set(['activeSetId', 'shuffled', 'repeatMissed', 'studyFilter', 'studyMode', 'theme', 'keybinds']);
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (plain(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  const equal = (left, right) => canonical(left) === canonical(right);
  function serializeLibrary(state) {
    const result = {};
    for (const key of FIELDS) if (state[key] !== undefined) result[key] = state[key];
    // Empty sessions are transient; their random IDs should not cause sync conflicts.
    if (!result.currentSession?.attempts) result.currentSession = null;
    return clone(result);
  }
  function validateLibrary(value) {
    const bad = message => { throw new Error('Invalid library: ' + message); };
    if (!plain(value) || !Array.isArray(value.sets) || !value.sets.length || !Array.isArray(value.folders)) bad('expected Recall decks and folders.');
    const inspect = (item, depth = 0) => {
      if (depth > 60) bad('data is too deeply nested.');
      if (typeof item === 'number' && !Number.isFinite(item)) bad('invalid number.');
      if (item && typeof item === 'object') for (const key of Object.keys(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) bad('unsafe property.');
        inspect(item[key], depth + 1);
      }
    };
    inspect(value);
    const ids = (rows, label, seen = new Set()) => {
      for (const row of rows) {
        if (!plain(row) || typeof row.id !== 'string' || !row.id || seen.has(row.id)) bad(label + ' must have unique IDs.');
        seen.add(row.id);
      }
      return seen;
    };
    const setIds = ids(value.sets, 'Decks');
    const folderIds = ids(value.folders, 'Folders');
    const cardIds = new Set();
    for (const folder of value.folders) if (typeof folder.name !== 'string') bad('folder name is missing.');
    for (const deck of value.sets) {
      if (typeof deck.name !== 'string' || !Array.isArray(deck.cards)) bad('deck name or cards are missing.');
      if (deck.folderId && !folderIds.has(deck.folderId)) bad('a deck references a missing folder.');
      if (deck.tags !== undefined && (!Array.isArray(deck.tags) || deck.tags.some(tag => typeof tag !== 'string'))) bad('deck tags must be text.');
      ids(deck.cards, 'Cards', cardIds);
      for (const card of deck.cards) {
        if (typeof card.front !== 'string' || typeof card.back !== 'string') bad('card sides must be text.');
        if (card.wordInfo !== undefined && card.wordInfo !== null && !plain(card.wordInfo)) bad('invalid word details.');
      }
    }
    if (value.activeSetId && !setIds.has(value.activeSetId)) bad('the active deck is missing.');
    for (const key of ['sessionHistory', 'testHistory', 'reviewLog']) {
      if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].some(item => !plain(item)))) bad('invalid ' + key + '.');
    }
    for (const test of value.testHistory || []) if (!Array.isArray(test.questions) || !Array.isArray(test.answers) || test.questions.some(item => !plain(item)) || test.answers.some(item => !plain(item))) bad('invalid test history.');
    for (const key of ['activity', 'keybinds', 'subjectColors']) if (value[key] !== undefined && !plain(value[key])) bad('invalid ' + key + '.');
    for (const day of Object.values(value.activity || {})) if (!plain(day)) bad('invalid activity entry.');
    if (value.currentSession !== undefined && value.currentSession !== null && !plain(value.currentSession)) bad('invalid current session.');
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BYTES) bad('cloud snapshots are limited to 2 MiB. Export larger libraries locally.');
    return clone(value);
  }
  function validateConfig(url = '', key = '') {
    url = url.trim(); key = key.trim();
    if (!url && !key) return { enabled: false, url: '', key: '' };
    if (!url || !key) throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY).');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('SUPABASE_URL must be your HTTPS Supabase project URL.'); }
    if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname) || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) throw new Error('Use the standard HTTPS project.supabase.co URL; custom domains are not required.');
    let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if (!publicKey && key.split('.').length === 3) {
      try { publicKey = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { /* reject unknown credentials */ }
    }
    if (!publicKey) throw new Error('Only a publishable or legacy anon key is allowed. Secret and service_role keys must never be bundled.');
    return { enabled: true, url: parsed.origin, key };
  }
  function sameVersion(left, right) {
    return left === null && right === null || Boolean(left && right && left.revision === right.revision && left.updated_at === right.updated_at);
  }
  function validateRow(row, userId) {
    if (row === null) return null;
    if (!plain(row) || row.user_id !== userId || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw new Error('The cloud returned an invalid backup record.');
    return { ...row, library: validateLibrary(row.library) };
  }
  function mergeLibraries(local, cloud, base = null) {
    validateLibrary(local); validateLibrary(cloud);
    if (base) validateLibrary(base);
    const conflicts = [];
    // Activity totals are aggregates, not independent edits. Two devices may
    // each increment a count to the same number; equality does not prove those
    // are the same reviews. Refuse ambiguous totals instead of losing a review.
    if (!equal(local.reviewLog || [], cloud.reviewLog || [])) {
      for (const day of Object.keys(local.activity || {})) {
        if (Object.hasOwn(cloud.activity || {}, day) && !equal(local.activity[day], base?.activity?.[day]) && !equal(cloud.activity[day], base?.activity?.[day])) conflicts.push('library.activity.' + day);
      }
    }
    const missing = Symbol('missing');
    const same = (a, b) => a === missing || b === missing ? a === b : equal(a, b);
    const get = (object, key) => object !== missing && Object.hasOwn(object, key) ? object[key] : missing;
    const keyed = rows => Array.isArray(rows) && rows.every(row => plain(row) && typeof row.id === 'string') && new Set(rows.map(row => row.id)).size === rows.length;
    function merge(l, r, b, path) {
      if (same(l, r)) return l;
      if (base && same(l, b)) return r;
      if (base && same(r, b)) return l;
      // Independently added objects are safe only when one side has no such ID.
      if (b === missing && l === missing) return r;
      if (b === missing && r === missing) return l;
      if (l !== missing && r !== missing && plain(l) && plain(r) && (plain(b) || path === 'library')) {
        const result = {};
        for (const key of new Set([...Object.keys(l), ...Object.keys(r), ...(plain(b) ? Object.keys(b) : [])])) {
          const val = path === 'library' && PREFERENCES.has(key) ? get(l, key) : merge(get(l, key), get(r, key), plain(b) ? get(b, key) : missing, path + '.' + key);
          if (val !== missing) result[key] = val;
        }
        return result;
      }
      if (keyed(l) && keyed(r) && (b === missing || keyed(b))) {
        const lm = new Map(l.map(row => [row.id, row])), rm = new Map(r.map(row => [row.id, row])), bm = new Map((b === missing ? [] : b).map(row => [row.id, row]));
        const result = [];
        for (const id of new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])) {
          const val = merge(lm.has(id) ? lm.get(id) : missing, rm.has(id) ? rm.get(id) : missing, bm.has(id) ? bm.get(id) : missing, path + '[' + id + ']');
          if (val !== missing) result.push(val);
        }
        return result;
      }
      conflicts.push(path);
      return l;
    }
    const merged = merge(local, cloud, base || missing, 'library');
    // Always keep device preferences for an explicit merge, including when
    // only the cloud changed since the baseline.
    const result = clone(merged);
    for (const key of PREFERENCES) if (Object.hasOwn(local, key)) result[key] = clone(local[key]);
    if (!result.sets.some(deck => deck.id === result.activeSetId)) result.activeSetId = result.sets[0]?.id || null;
    if (!conflicts.length) {
      try { validateLibrary(result); } catch { conflicts.push('library relationships or size'); }
    }
    return { safe: conflicts.length === 0, library: conflicts.length ? null : result, conflicts };
  }
  const summary = library => ({ decks: library.sets.length, cards: library.sets.reduce((sum, deck) => sum + deck.cards.length, 0), folders: library.folders.length });
  return { STORAGE_KEY, RECOVERY_KEY, MAX_BYTES, FIELDS, clone, equal, serializeLibrary, validateLibrary, validateConfig, sameVersion, validateRow, mergeLibraries, summary };
});
