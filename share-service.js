(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./share-core'));
  else root.RecallShareService = factory(root.RecallShareCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  async function sha256(value, cryptoApi = globalThis.crypto) {
    const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function createService(client, cryptoApi = globalThis.crypto) {
    if (!client) throw new Error('Cloud sharing is not configured in this build. You can still export a local share file.');
    async function user() {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      if (!data?.user?.id) throw new Error('Sign in to create or manage deck links.');
      return data.user.id;
    }
    async function create(deck, days = 30) {
      if (![7, 30].includes(days)) throw new Error('Choose a supported link lifetime.');
      const owner = await user();
      const snapshot = Core.snapshotDeck(deck);
      const token = Core.newToken(cryptoApi);
      const tokenHash = await sha256(token, cryptoApi);
      const expires = new Date(Date.now() + days * 86400000).toISOString();
      const { data, error } = await client.from('recall_deck_shares').insert({ owner_id: owner, deck_id: deck.id, token_hash: tokenHash, deck: snapshot, expires_at: expires }).select('id,deck_id,created_at,expires_at,revoked_at').single();
      if (error) throw error;
      if (!data?.id) throw new Error('The share link was not created.');
      return { ...data, token };
    }
    async function list(deckId) {
      const owner = await user();
      const query = client.from('recall_deck_shares').select('id,deck_id,created_at,expires_at,revoked_at').eq('owner_id', owner);
      const { data, error } = await (deckId ? query.eq('deck_id', deckId) : query);
      if (error) throw error;
      return data || [];
    }
    async function revoke(id) {
      const owner = await user();
      const { data, error } = await client.from('recall_deck_shares').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('owner_id', owner).is('revoked_at', null).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This link is already revoked, deleted, or does not belong to your account.');
      return data;
    }
    async function preview(input) {
      const token = Core.tokenFromInput(input);
      const { data, error } = await client.rpc('recall_preview_deck_share', { p_token: token });
      if (error) throw error;
      if (!data) throw new Error('This share link is invalid, expired, revoked, or deleted. Ask the owner for a new link.');
      return { token, deck: Core.validateSnapshot(data) };
    }
    return { create, list, revoke, preview };
  }
  return { createService, sha256 };
});
