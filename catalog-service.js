(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RecallCatalogService = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function createService(client) {
    async function invoke(body) {
      const { data, error } = await client.functions.invoke('admin-library', { body, timeout: 25000 });
      if (error || !data || data.error) {
        let message = data?.error;
        if (!message && error?.context?.json) {
          try { message = (await error.context.json()).error; } catch { /* Network failure; outcome may be unknown. */ }
        }
        throw new Error(message || 'Publication could not be confirmed. Retry this same confirmation safely; do not start another publication.');
      }
      return data;
    }
    return {
      async access() {
        const { data, error } = await client.auth.getSession();
        if (error || !data?.session?.user) return null;
        const checked = await invoke({ action: 'status' });
        return checked.authorized === true ? data.session.user.id : null;
      },
      async publish(publication, expectedUserId) {
        const { data, error } = await client.auth.getUser();
        if (error || !expectedUserId || data?.user?.id !== expectedUserId) throw new Error('Your account changed. Sign in and start again.');
        const result = await invoke({ action: 'publish', ...publication });
        if (!/^web-[a-f0-9]{32}$/.test(result.id) || result.title !== publication.metadata.title || result.cardCount !== publication.deck.cards.length
          || result.version !== publication.metadata.version || typeof result.replayed !== 'boolean') {
          throw new Error('Publication could not be confirmed. Retry this same confirmation safely; do not start another publication.');
        }
        return result;
      },
      async load() {
        const rows = [];
        for (let start = 0; ; start += 25) {
          const { data, error } = await client.from('recall_catalog_decks').select('id,snapshot').order('id').range(start, start + 24).abortSignal(AbortSignal.timeout(10000));
          if (error || !Array.isArray(data)) throw new Error('Online library unavailable. Bundled decks are still available.');
          rows.push(...data);
          if (data.length < 25) return rows;
          if (rows.length > 10000) throw new Error('Online library unavailable. Bundled decks are still available.');
        }
      },
    };
  }
  return { createService };
});
