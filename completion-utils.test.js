const test = require('node:test');
const assert = require('node:assert/strict');
const { summariseSession } = require('./completion-utils');

test('completion summary reports session totals and accuracy', () => {
  assert.deepEqual(summariseSession({ attempts: 5, correct: 3, retry: 2 }), { reviewed: 5, correct: 3, retry: 2, accuracy: 60 });
});

test('completion summary handles an empty session', () => {
  assert.deepEqual(summariseSession(null), { reviewed: 0, correct: 0, retry: 0, accuracy: 0 });
});
