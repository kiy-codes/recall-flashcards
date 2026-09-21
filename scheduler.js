(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RecallScheduler = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SCHEDULER_VERSION = 'baseline-v1';
  const MINUTES = 60 * 1000;
  const DAYS = 24 * 60 * MINUTES;
  const asDate = value => value instanceof Date ? value : new Date(value);
  const add = (date, ms) => new Date(asDate(date).getTime() + ms).toISOString();
  const schedulingDefaults = card => ({ dueAt: card?.dueAt || new Date(0).toISOString(), lastReviewedAt: card?.lastReviewedAt || null, repetitions: Number.isFinite(card?.repetitions) ? card.repetitions : 0, lapses: Number.isFinite(card?.lapses) ? card.lapses : 0, schedulerVersion: card?.schedulerVersion || SCHEDULER_VERSION });
  const isDue = (card, now = new Date()) => !card?.dueAt || new Date(card.dueAt).getTime() <= asDate(now).getTime();
  const getNextReview = (card, outcome, reviewedAt = new Date()) => {
    const current = schedulingDefaults(card); const at = asDate(reviewedAt); const successful = outcome === 'correct';
    if (!successful) return { ...current, dueAt: add(at, 10 * MINUTES), lastReviewedAt: at.toISOString(), repetitions: 0, lapses: current.lapses + 1, schedulerVersion: SCHEDULER_VERSION };
    const repetitions = current.repetitions + 1; const intervals = [1, 3, 7, 14, 30, 60]; const days = intervals[Math.min(repetitions - 1, intervals.length - 1)];
    return { ...current, dueAt: add(at, days * DAYS), lastReviewedAt: at.toISOString(), repetitions, schedulerVersion: SCHEDULER_VERSION };
  };
  const scheduleCard = (card, outcome, reviewedAt = new Date()) => Object.assign(card, getNextReview(card, outcome, reviewedAt));
  const createReviewEvent = (card, outcome, reviewedAt = new Date(), responseTimeMs = 0, deckId = null) => ({
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cardId: card.id,
    deckId,
    timestamp: asDate(reviewedAt).toISOString(),
    outcome,
    responseTimeMs: Math.max(0, Number(responseTimeMs) || 0),
    schedulerVersion: card.schedulerVersion || SCHEDULER_VERSION,
  });
  const migrateCard = card => ({ ...card, ...schedulingDefaults(card) });
  return { SCHEDULER_VERSION, schedulingDefaults, getNextReview, isDue, scheduleCard, createReviewEvent, migrateCard };
});
