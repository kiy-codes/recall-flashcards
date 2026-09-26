const test = require('node:test');
const assert = require('node:assert/strict');
const { summariseSession } = require('./completion-utils');

test('completion summary reports session totals and accuracy', () => {
  assert.deepEqual(summariseSession({ attempts: 5, correct: 3, retry: 2 }), { reviewed: 5, correct: 3, partial: 0, retry: 2, accuracy: 60 });
});

test('partial appeals count fractionally but remain in the needs-practice count', () => {
  assert.deepEqual(summariseSession({ attempts: 2, correct: 1, retry: 1, partial: 1, partialPoints: .55 }), { reviewed: 2, correct: 1, partial: 1, retry: 1, accuracy: 78 });
});

test('completion summary handles an empty session', () => {
  assert.deepEqual(summariseSession(null), { reviewed: 0, correct: 0, partial: 0, retry: 0, accuracy: 0 });
});
