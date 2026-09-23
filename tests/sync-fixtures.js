(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecallSyncFixtures = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  function library() {
    return { sets: [{ id: 'deck-1', name: 'German', folderId: 'folder-1', tags: ['language'], cards: [{ id: 'card-1', front: 'Haus', back: 'House', wordInfo: { gender: 'neuter' }, nextReviewAt: '2026-09-24T12:00:00.000Z', reviewCount: 1 }] }], folders: [{ id: 'folder-1', name: 'Languages' }], activeSetId: 'deck-1', sessionHistory: [], testHistory: [], reviewLog: [], currentSession: null, activity: {}, shuffled: true, repeatMissed: false, studyFilter: 'all', studyMode: 'flip', theme: 'system', keybinds: { flip: 'w' }, subjectColors: {} };
  }
  function memoryStorage() {
    const map = new Map();
    return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), clear: () => map.clear(), map };
  }
  function fakeClient(initial = null) {
    let session = initial;
    let counter = 0;
    const listeners = new Set();
    const client = {
      rows: new Map(), calls: [], authError: null, requestError: null, beforeQuery: null,
      setSession(next) { session = next; listeners.forEach(fn => fn(next ? 'SIGNED_IN' : 'SIGNED_OUT', copy(next))); },
      seed(userId, data, revision = 1) {
        const row = { user_id: userId, library: copy(data), revision, updated_at: new Date(Date.UTC(2026, 8, 23, 12, 0, ++counter)).toISOString() };
        client.rows.set(userId, row); return copy(row);
      },
      auth: {
        onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
        async getSession() { return { data: { session: copy(session) }, error: client.authError }; },
        async signInWithPassword({ email }) {
          if (client.authError) return { data: {}, error: client.authError };
          client.setSession({ user: { id: email === 'other@example.test' ? 'user-2' : 'user-1', email } });
          return { data: { session: copy(session) }, error: null };
        },
        async signUp(args) { if (client.confirmEmail) return { data: { session: null }, error: null }; return this.signInWithPassword(args); },
        async signOut(options) {
          client.calls.push({ auth: 'signout', options });
          if (client.authError) return { error: client.authError };
          client.setSession(null); return { error: null };
        },
      },
      from(table) {
        const request = { table, operation: 'select', filters: {} };
        const query = {
          select() { return query; },
          eq(key, value) { request.filters[key] = value; return query; },
          update(value) { request.operation = 'update'; request.value = copy(value); return query; },
          insert(value) { request.operation = 'insert'; request.value = copy(value); return query; },
          async maybeSingle() {
            const authorizedUser = session?.user?.id;
            client.calls.push(copy(request));
            if (client.beforeQuery) await client.beforeQuery(request);
            if (client.requestError) return { data: null, error: client.requestError };
            const id = request.filters.user_id || request.value?.user_id;
            if (!authorizedUser || id !== authorizedUser) return { data: null, error: { code: '42501' } };
            const row = client.rows.get(id);
            if (request.operation === 'select') return { data: copy(row || null), error: null };
            if (request.operation === 'insert') {
              if (row) return { data: null, error: { code: '23505' } };
              return { data: client.seed(id, request.value.library), error: null };
            }
            if (!row || row.revision !== request.filters.revision || row.updated_at !== request.filters.updated_at) return { data: null, error: null };
            return { data: client.seed(id, request.value.library, row.revision + 1), error: null };
          },
        };
        return query;
      },
    };
    return client;
  }
  const session = { user: { id: 'user-1', email: 'learner@example.test' } };
  return { copy, library, memoryStorage, fakeClient, session };
});
