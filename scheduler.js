(function (root, factory) {
  const fsrs = typeof module === 'object' && module.exports ? require('ts-fsrs') : root.FSRS;
  const api = factory(fsrs);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RecallScheduler = api;
})(typeof window !== 'undefined' ? window : globalThis, function (FSRS) {
  'use strict';
  const SCHEDULER_VERSION = 'fsrs-6';
  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;
  const DEFAULT_NEW_LIMIT = 20;
  const RATINGS = ['Again', 'Hard', 'Good', 'Easy'];
  const scheduler = FSRS.fsrs({ enable_fuzz: false, enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] });
  const asDate = value => value instanceof Date ? value : new Date(value);
  const validDate = value => value && Number.isFinite(asDate(value).getTime()) ? asDate(value).toISOString() : null;
  const nonnegative = (value, fallback = 0) => Number.isFinite(value) && value >= 0 ? value : fallback;
  const localDayKey = value => {
    const date = asDate(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const localDayStart = value => { const date = asDate(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate()); };
  const nextLocalDayStart = value => { const date = localDayStart(value); date.setDate(date.getDate() + 1); return date; };
  const isNew = card => !card?.lastReviewedAt && nonnegative(card?.reviewCount) === 0 && (card?.state === 'New' || !card?.state);

  function fsrsCard(card = {}) {
    const stored = card.fsrs && typeof card.fsrs === 'object' ? card.fsrs : {};
    const empty = FSRS.createEmptyCard(new Date(0));
    return {
      due: validDate(card.dueAt) || validDate(stored.due) || empty.due.toISOString(),
      stability: nonnegative(stored.stability), difficulty: nonnegative(stored.difficulty),
      elapsed_days: nonnegative(stored.elapsed_days), scheduled_days: nonnegative(stored.scheduled_days),
      learning_steps: nonnegative(stored.learning_steps), reps: nonnegative(stored.reps),
      lapses: nonnegative(stored.lapses, nonnegative(card.lapses)),
      state: Number.isInteger(stored.state) && stored.state >= 0 && stored.state <= 3 ? stored.state : 0,
      last_review: validDate(stored.last_review) || validDate(card.lastReviewedAt) || undefined,
    };
  }
  function schedulingDefaults(card = {}) {
    const fsrs = fsrsCard(card);
    return {
      dueAt: fsrs.due, lastReviewedAt: validDate(card.lastReviewedAt) || fsrs.last_review || null,
      repetitions: nonnegative(card.repetitions), lapses: nonnegative(card.lapses),
      schedulerVersion: card.schedulerVersion || SCHEDULER_VERSION, fsrs,
    };
  }
  const migrateCard = card => ({ ...card, ...schedulingDefaults(card) });
  const isDue = (card, now = new Date()) => !validDate(card?.dueAt) || asDate(card.dueAt).getTime() <= asDate(now).getTime();
  const dueToday = (card, now = new Date()) => !isNew(card) && (!validDate(card?.dueAt) || asDate(card.dueAt).getTime() < nextLocalDayStart(now).getTime());
  function ratingValue(rating) {
    const name = rating === 'correct' ? 'Good' : rating === 'retry' ? 'Again' : rating;
    if (!RATINGS.includes(name)) throw new Error('Invalid review rating.');
    return FSRS.Rating[name];
  }
  function previewRatings(card, reviewedAt = new Date()) {
    const at = asDate(reviewedAt);
    const preview = scheduler.repeat(fsrsCard(card), at);
    return Object.fromEntries(RATINGS.map(name => [name, {
      dueAt: preview[FSRS.Rating[name]].card.due.toISOString(),
      intervalMs: Math.max(0, preview[FSRS.Rating[name]].card.due.getTime() - at.getTime()),
    }]));
  }
  function getNextReview(card, rating, reviewedAt = new Date()) {
    const at = asDate(reviewedAt);
    if (!Number.isFinite(at.getTime())) throw new Error('Invalid review time.');
    const next = scheduler.next(fsrsCard(card), at, ratingValue(rating)).card;
    const fsrs = { ...next, due: next.due.toISOString(), last_review: next.last_review?.toISOString() || null };
    return { dueAt: fsrs.due, lastReviewedAt: at.toISOString(), repetitions: fsrs.reps,
      lapses: fsrs.lapses, schedulerVersion: SCHEDULER_VERSION, fsrs };
  }
  const scheduleCard = (card, rating, reviewedAt = new Date()) => Object.assign(card, getNextReview(card, rating, reviewedAt));
  function formatInterval(ms) {
    if (ms < MINUTE) return '<1m';
    if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)}m`;
    if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))}h`;
    return `${Math.round(ms / DAY)}d`;
  }
  const createReviewEvent = (card, outcome, reviewedAt = new Date(), responseTimeMs = 0, deckId = null, wasNew = false) => ({
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cardId: card.id, deckId, timestamp: asDate(reviewedAt).toISOString(), outcome,
    rating: RATINGS.includes(outcome) ? outcome : outcome === 'correct' ? 'Good' : 'Again',
    wasNew: Boolean(wasNew), responseTimeMs: Math.max(0, Number(responseTimeMs) || 0),
    schedulerVersion: card.schedulerVersion || SCHEDULER_VERSION,
  });
  function newCardsReviewedToday(reviewLog = [], now = new Date()) {
    const day = localDayKey(now);
    return new Set(reviewLog.filter(event => event?.wasNew && event.cardId && validDate(event.timestamp) && localDayKey(event.timestamp) === day).map(event => event.cardId)).size;
  }
  function buildDailyQueue(sets, reviewLog = [], newLimit = DEFAULT_NEW_LIMIT, now = new Date(), scope = {}) {
    const at = asDate(now);
    const todayStart = localDayStart(at).getTime();
    const tomorrow = nextLocalDayStart(at).getTime();
    const remainingNew = Math.max(0, Math.min(100, Math.floor(Number(newLimit) || 0)) - newCardsReviewedToday(reviewLog, at));
    const entries = [];
    for (const deck of sets || []) {
      if (scope.deckId && deck.id !== scope.deckId) continue;
      const topic = deck.topic || deck.sourceLibrary?.topic || '';
      if (scope.topic && topic !== scope.topic) continue;
      for (const card of deck.cards || []) {
        const fresh = isNew(card);
        const due = validDate(card.dueAt) ? new Date(card.dueAt).getTime() : 0;
        if (!fresh && due >= tomorrow) continue;
        if (fresh && !remainingNew) continue;
        const learning = card.fsrs?.state === 1 || card.fsrs?.state === 3 || card.state === 'Learning';
        if (learning && due > at.getTime()) continue;
        const priority = fresh ? 3 : due < todayStart ? 0 : learning ? 2 : 1;
        entries.push({ deckId: deck.id, cardId: card.id, priority, due });
      }
    }
    entries.sort((a, b) => a.priority - b.priority || a.due - b.due || a.cardId.localeCompare(b.cardId));
    let freshAdded = 0;
    return entries.filter(item => item.priority !== 3 || ++freshAdded <= remainingNew).map(({ deckId, cardId }) => ({ deckId, cardId }));
  }
  function progress(sets, reviewLog = [], now = new Date()) {
    const cards = (sets || []).flatMap(deck => deck.cards || []);
    const fresh = cards.filter(isNew).length;
    const learning = cards.filter(card => !isNew(card) && (card.fsrs?.state === 1 || card.fsrs?.state === 3 || card.state === 'Learning')).length;
    const reviewedToday = reviewLog.filter(event => validDate(event?.timestamp) && localDayKey(event.timestamp) === localDayKey(now)).length;
    return { new: fresh, learning, learned: cards.length - fresh - learning,
      due: cards.filter(card => dueToday(card, now)).length, reviewedToday };
  }
  function streak(reviewLog = [], now = new Date()) {
    const days = new Set(reviewLog.filter(event => validDate(event?.timestamp)).map(event => localDayKey(event.timestamp)));
    const cursor = localDayStart(now);
    if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let current = 0;
    while (days.has(localDayKey(cursor))) { current += 1; cursor.setDate(cursor.getDate() - 1); }
    return current;
  }
  return { SCHEDULER_VERSION, DEFAULT_NEW_LIMIT, RATINGS, localDayKey, localDayStart, nextLocalDayStart,
    isNew, dueToday, schedulingDefaults, getNextReview, previewRatings, formatInterval, isDue, scheduleCard,
    createReviewEvent, migrateCard, newCardsReviewedToday, buildDailyQueue, progress, streak };
});
