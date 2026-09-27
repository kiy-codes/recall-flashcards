const test = require('node:test');
const assert = require('node:assert/strict');
const { getNextReview, previewRatings, isDue, dueToday, isNew, scheduleCard, createReviewEvent, migrateCard, buildDailyQueue, progress, streak, newCardsReviewedToday, localDayKey, nextLocalDayStart, SCHEDULER_VERSION } = require('./scheduler');
const at = new Date('2026-01-01T12:00:00.000Z');
test('new cards are immediately due', () => { assert.equal(isDue({}, at), true); assert.equal(isDue(migrateCard({}), at), true); });
test('first FSRS review previews all four ratings before choosing one', () => {
  const card = migrateCard({ state: 'New', reviewCount: 0 });
  const previews = previewRatings(card, at);
  assert.deepEqual(Object.keys(previews), ['Again', 'Hard', 'Good', 'Easy']);
  assert.equal(previews.Again.intervalMs, 60000);
  assert(previews.Again.intervalMs < previews.Hard.intervalMs);
  assert(previews.Hard.intervalMs < previews.Good.intervalMs);
  assert(previews.Good.intervalMs < previews.Easy.intervalMs);
  for (const rating of Object.keys(previews)) {
    const next = getNextReview(card, rating, at);
    assert.equal(next.dueAt, previews[rating].dueAt);
    assert.equal(next.fsrs.reps, 1);
    assert.equal(next.schedulerVersion, SCHEDULER_VERSION);
  }
});
test('legacy correct/retry study buttons map to FSRS Good/Again', () => {
  assert.equal(getNextReview({}, 'correct', at).dueAt, getNextReview({}, 'Good', at).dueAt);
  assert.equal(getNextReview({}, 'retry', at).dueAt, getNextReview({}, 'Again', at).dueAt);
});
test('subsequent reviews use FSRS memory and preserve due calculations', () => {
  const first = migrateCard({ state: 'New', reviewCount: 0 });
  scheduleCard(first, 'Good', at);
  first.reviewCount = 1;
  const secondAt = new Date(first.dueAt);
  const second = getNextReview(first, 'Easy', secondAt);
  assert(new Date(second.dueAt) > secondAt);
  assert(second.fsrs.stability > 0 && second.fsrs.difficulty > 0);
  assert.equal(isDue(second, secondAt), false);
});
test('old cards migrate without losing existing data and remain immediately due', () => { const migrated = migrateCard({ id: 'old', state: 'Mastered', reviewCount: 4 }); assert.equal(migrated.id, 'old'); assert.equal(migrated.state, 'Mastered'); assert.equal(migrated.schedulerVersion, SCHEDULER_VERSION); assert.equal(isDue(migrated, at), true); });
test('migration preserves prior baseline due dates and seeds FSRS safely', () => {
  const dueAt = '2026-01-05T12:00:00.000Z';
  const card = migrateCard({ id: 'legacy', state: 'Mastered', reviewCount: 5, dueAt, lastReviewedAt: at.toISOString(), repetitions: 3, lapses: 1, schedulerVersion: 'baseline-v1' });
  assert.equal(card.dueAt, dueAt);
  assert.equal(card.reviewCount, 5);
  assert.equal(card.fsrs.state, 0);
  assert.equal(isNew(card), false);
  assert(new Date(getNextReview(card, 'Good', new Date(dueAt)).dueAt) > new Date(dueAt));
});
test('due filtering respects boundary times', () => { const card = { dueAt: '2026-01-01T12:00:00.000Z' }; assert.equal(isDue(card, at), true); assert.equal(isDue(card, new Date('2026-01-01T11:59:59.999Z')), false); });
test('scheduled review metadata is written to the card', () => { const card = {}; scheduleCard(card, 'correct', at); assert.equal(card.lastReviewedAt, at.toISOString()); assert.equal(card.schedulerVersion, SCHEDULER_VERSION); });
test('review events survive JSON persistence', () => { const event = createReviewEvent({ id: 'card-1', schedulerVersion: SCHEDULER_VERSION }, 'correct', at, 1450, 'deck-1'); const restored = JSON.parse(JSON.stringify([event])); assert.equal(restored[0].cardId, 'card-1'); assert.equal(restored[0].outcome, 'correct'); assert.equal(restored[0].responseTimeMs, 1450); });
test('daily queue orders overdue, due, learning, then limited new cards', () => {
  const sets = [{ id: 'deck', cards: [
    { id: 'new-b', state: 'New', reviewCount: 0 },
    { id: 'learning', state: 'Learning', reviewCount: 1, dueAt: '2026-01-01T11:00:00Z', fsrs: { state: 1 } },
    { id: 'due', state: 'Mastered', reviewCount: 3, dueAt: '2026-01-01T15:00:00Z' },
    { id: 'overdue', state: 'Mastered', reviewCount: 3, dueAt: '2025-12-30T15:00:00Z' },
    { id: 'new-a', state: 'New', reviewCount: 0 },
  ] }];
  assert.deepEqual(buildDailyQueue(sets, [], 1, at).map(item => item.cardId), ['overdue', 'due', 'learning', 'new-a']);
});
test('daily new-card limit is global and first reviews count only once', () => {
  const sets = [{ id: 'a', cards: [{ id: 'a1', state: 'New', reviewCount: 0 }] }, { id: 'b', cards: [{ id: 'b1', state: 'New', reviewCount: 0 }] }];
  const log = [createReviewEvent({ id: 'old' }, 'Good', at, 1000, 'a', true), createReviewEvent({ id: 'old' }, 'Again', at, 1000, 'a', false)];
  assert.equal(newCardsReviewedToday(log, at), 1);
  assert.equal(buildDailyQueue(sets, log, 1, at).length, 0);
  assert.equal(buildDailyQueue(sets, log, 2, at).length, 1);
  assert.equal(buildDailyQueue(sets, [], 1, at, { deckId: 'b' })[0].cardId, 'b1');
});
test('copied library decks can be filtered by their topic and are reviewed as user cards', () => {
  const sets = [{ id: 'copy', sourceLibrary: { topic: 'Waves' }, cards: [migrateCard({ id: 'copied', state: 'New', reviewCount: 0 })] }];
  assert.deepEqual(buildDailyQueue(sets, [], 20, at, { topic: 'Waves' }), [{ deckId: 'copy', cardId: 'copied' }]);
  assert.equal(buildDailyQueue(sets, [], 20, at, { topic: 'Cells' }).length, 0);
});
test('future learning steps wait until due and reviewed cards remain separate from new', () => {
  const card = migrateCard({ id: 'learning', state: 'Learning', reviewCount: 1, dueAt: '2026-01-01T12:10:00Z', fsrs: { state: 1 } });
  assert.equal(dueToday(card, at), true);
  assert.equal(buildDailyQueue([{ id: 'deck', cards: [card] }], [], 20, at).length, 0);
  assert.equal(buildDailyQueue([{ id: 'deck', cards: [card] }], [], 20, new Date('2026-01-01T12:10:00Z')).length, 1);
});
test('progress and streak count completed reviews by local calendar day', () => {
  const card = migrateCard({ id: 'x', state: 'Mastered', reviewCount: 3, dueAt: at.toISOString() });
  const sets = [{ id: 'deck', cards: [card, migrateCard({ id: 'new', state: 'New', reviewCount: 0 })] }];
  const yesterday = new Date(at); yesterday.setDate(yesterday.getDate() - 1);
  const log = [createReviewEvent(card, 'Good', yesterday), createReviewEvent(card, 'Hard', at)];
  assert.deepEqual(progress(sets, log, at), { new: 1, learning: 0, learned: 1, due: 1, reviewedToday: 1 });
  assert.equal(streak(log, at), 2);
  assert.equal(streak([log[0]], at), 1);
  assert.equal(localDayKey(nextLocalDayStart(at)), localDayKey(new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1)));
});
test('a persisted, interrupted queue resumes after the rated card without reshowing it', () => {
  const sets = [{ id: 'deck', cards: [migrateCard({ id: 'a', state: 'New', reviewCount: 0 }), migrateCard({ id: 'b', state: 'New', reviewCount: 0 })] }];
  const session = { queue: buildDailyQueue(sets, [], 2, at), index: 0 };
  const first = sets[0].cards.find(card => card.id === session.queue[0].cardId);
  scheduleCard(first, 'Good', at); first.reviewCount += 1; first.state = 'Learning';
  session.index += 1;
  const restored = JSON.parse(JSON.stringify({ sets, session }));
  assert.equal(restored.session.queue[restored.session.index].cardId, 'b');
  assert.equal(buildDailyQueue(restored.sets, [], 2, at).some(item => item.cardId === 'a'), false);
});
test('local day boundaries use calendar dates through daylight saving changes', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Europe/London';
    const spring = new Date('2026-03-29T12:00:00Z');
    const autumn = new Date('2026-10-25T12:00:00Z');
    assert.equal((nextLocalDayStart(spring) - new Date(2026, 2, 29)) / 3600000, 23);
    assert.equal((nextLocalDayStart(autumn) - new Date(2026, 9, 25)) / 3600000, 25);
    const midnight = nextLocalDayStart(spring);
    assert.equal(dueToday({ state: 'Mastered', reviewCount: 1, dueAt: new Date(midnight.getTime() - 1).toISOString() }, spring), true);
    assert.equal(dueToday({ state: 'Mastered', reviewCount: 1, dueAt: midnight.toISOString() }, spring), false);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
