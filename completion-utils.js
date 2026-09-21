(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RecallCompletion = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function summariseSession(session) {
    const reviewed = Math.max(0, Number(session?.attempts) || 0);
    const correct = Math.max(0, Number(session?.correct) || 0);
    const retry = Math.max(0, Number(session?.retry) || 0);
    return { reviewed, correct, retry, accuracy: reviewed ? Math.round((correct / reviewed) * 100) : 0 };
  }

  return { summariseSession };
});
