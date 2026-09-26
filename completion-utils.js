(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RecallCompletion = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function summariseSession(session) {
    const reviewed = Math.max(0, Number(session?.attempts) || 0);
    const correct = Math.max(0, Number(session?.correct) || 0);
    const retry = Math.max(0, Number(session?.retry) || 0);
    const partial = Math.max(0, Number(session?.partial) || 0);
    const partialPoints = Math.max(0, Math.min(partial * 0.79, Number(session?.partialPoints) || 0));
    return { reviewed, correct, partial, retry, accuracy: reviewed ? Math.round(((correct + partialPoints) / reviewed) * 100) : 0 };
  }

  return { summariseSession };
});
