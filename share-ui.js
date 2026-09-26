(function () {
  'use strict';
  const Core = window.RecallShareCore;
  const factory = window.RecallCloudClient;
  const local = window.RecallLibrary;
  const service = factory?.enabled ? window.RecallShareService.createService(factory.create()) : null;
  const key = 'recall-shared-with-me-v1:' + (factory?.namespace || 'local');
  // Share codes are bearer credentials, so do not retain the old persistent copy.
  try { window.localStorage.removeItem(key); } catch { /* private storage may be unavailable */ }
  const dialog = document.createElement('dialog');
  dialog.id = 'deckShareDialog'; dialog.className = 'account-dialog deck-share-dialog';
  dialog.setAttribute('aria-labelledby', 'deckShareTitle');
  dialog.innerHTML = `<header class="account-head"><div><p class="eyebrow">Deck sharing</p><h2 id="deckShareTitle">Share a deck</h2></div><button class="text-button" data-share-action="close" type="button">Close</button></header>
    <p class="account-help">Links contain a snapshot of card sides, deck tags and learning metadata. They never include your account details, notes, hints, due dates or study history. Recipients get an independent editable copy.</p>
    <section id="shareOwnerSection"><h3 id="shareOwnerName"></h3><p class="account-help">A link does not update when you edit this deck. Create a new one for a new snapshot.</p><div class="account-actions"><label>Link expires<select id="shareLifetime"><option value="30">30 days</option><option value="7">7 days</option></select></label><button class="primary-button" data-share-action="create" type="button">Create private link</button></div><div id="shareCreated" hidden><label>Share code or link<input id="shareCreatedValue" type="text" readonly /></label><button class="text-button" data-share-action="copy" type="button">Copy link/code</button><p class="account-help">Keep this code now; for safety it cannot be recovered from the server later.</p></div><h3>Existing links</h3><div id="shareOwnerLinks"></div></section>
    <section class="account-choice"><h3>Open a shared deck</h3><label>Private link or code<input id="shareCodeInput" type="text" autocomplete="off" placeholder="Paste a Recall link or code" /></label><div class="account-actions"><button class="text-button" data-share-action="preview" type="button">Preview deck</button></div><div id="sharePreview" hidden></div></section>
    <section class="account-choice"><h3>Shared with me</h3><p class="account-help">Links you preview in this browser session appear here. They are not copied into your library until you choose Copy to my library.</p><div id="shareSavedLinks"></div></section><p id="shareStatus" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const el = id => dialog.querySelector('#' + id);
  const escape = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]);
  let ownerDeckId = null, createdValue = '', preview = null, busy = false;
  function status(message, error = false) { el('shareStatus').textContent = message; el('shareStatus').classList.toggle('account-error', error); }
  function saved() {
    try { const value = JSON.parse(sessionStorage.getItem(key)); return Array.isArray(value) ? value.filter(item => Core.validToken(item.token)).slice(0, 50) : []; }
    catch { return []; }
  }
  function writeSaved(rows) { try { sessionStorage.setItem(key, JSON.stringify(rows.slice(0, 50))); } catch { status('This browser could not save the link to Shared with me; you can still use the code.', true); } }
  function renderSaved() {
    const rows = saved();
    el('shareSavedLinks').innerHTML = rows.length ? rows.map(item => `<div class="share-link-row"><span>${escape(item.name || 'Shared deck')}</span><button class="text-button" data-share-open="${item.token}" type="button">Preview</button><button class="text-button" data-share-forget="${item.token}" type="button">Forget</button></div>`).join('') : '<p class="account-help">No saved links on this device yet.</p>';
  }
  function renderPreview() {
    const section = el('sharePreview'); section.hidden = !preview;
    if (!preview) { section.innerHTML = ''; return; }
    const deck = preview.deck;
    section.innerHTML = `<h3>${escape(deck.name)}</h3><p>${escape(deck.subject)} · ${deck.cards.length} card${deck.cards.length === 1 ? '' : 's'}${deck.tags.length ? ` · ${escape(deck.tags.join(', '))}` : ''}</p><div class="share-preview-cards">${deck.cards.map(card => `<div><strong>${escape(card.front)}</strong><span>${escape(card.back)}</span></div>`).join('') || '<p>This deck has no cards yet.</p>'}</div><p class="account-help">This is a read-only preview. Copying creates new cards with fresh progress on this device; it does not change the owner’s deck.</p><button class="primary-button" data-share-action="import" type="button">Copy to my library</button>`;
  }
  async function renderOwnerLinks() {
    if (!ownerDeckId) return;
    const requestedDeckId = ownerDeckId;
    if (!service) { el('shareOwnerLinks').textContent = 'Cloud sharing is not configured in this build. You can still use Export share file on Deck cards.'; return; }
    try {
      const links = await service.list(requestedDeckId);
      if (!dialog.open || ownerDeckId !== requestedDeckId) return;
      el('shareOwnerLinks').innerHTML = links.length ? links.map(item => `<div class="share-link-row"><span>${item.revoked_at ? 'Revoked' : new Date(item.expires_at).getTime() <= Date.now() ? 'Expired' : 'Active'} · expires ${escape(new Date(item.expires_at).toLocaleDateString())}</span>${item.revoked_at ? '' : `<button class="text-button" data-share-revoke="${escape(item.id)}" type="button">Revoke</button>`}</div>`).join('') : '<p class="account-help">No links for this deck yet.</p>';
    } catch (error) { el('shareOwnerLinks').textContent = error.message === 'Sign in to create or manage deck links.' ? error.message : 'Could not load links. Check your account connection and Supabase schema.'; }
  }
  function open(deckId = null) {
    ownerDeckId = deckId;
    preview = null; createdValue = '';
    el('shareCodeInput').value = ''; el('shareCreated').hidden = true;
    el('shareOwnerSection').hidden = !deckId;
    el('deckShareTitle').textContent = deckId ? 'Share a deck' : 'Shared with me';
    if (deckId) el('shareOwnerName').textContent = local.deck(deckId)?.name || 'Deck';
    renderPreview(); renderSaved(); status('');
    if (!dialog.open) dialog.showModal();
    if (deckId) renderOwnerLinks();
  }
  async function act(action) {
    if (busy) return;
    busy = true;
    try {
      if (action === 'create') {
        if (!service) throw new Error('Cloud sharing is not configured in this build. Use Export share file for offline sharing.');
        const deck = local.deck(ownerDeckId); if (!deck) throw new Error('This deck was deleted.');
        const result = await service.create(deck, Number(el('shareLifetime').value));
        createdValue = location.protocol === 'http:' || location.protocol === 'https:' ? `${location.origin}${location.pathname}#share=${result.token}` : result.token;
        el('shareCreatedValue').value = createdValue; el('shareCreated').hidden = false;
        status('Private link created. Anyone with the code can preview until it expires or is revoked.');
        await renderOwnerLinks();
      } else if (action === 'copy') {
        if (!createdValue) return;
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(createdValue);
        else { el('shareCreatedValue').focus(); el('shareCreatedValue').select(); if (!document.execCommand?.('copy')) throw new Error('The code is selected. Press Ctrl+C to copy it.'); }
        status('Link or code copied.');
      } else if (action === 'preview') {
        if (!service) throw new Error('Cloud sharing is not configured in this build.');
        preview = await service.preview(el('shareCodeInput').value);
        renderPreview();
        writeSaved([{ token: preview.token, name: preview.deck.name }, ...saved().filter(item => item.token !== preview.token)]);
        renderSaved(); status('Preview ready. Nothing has been imported yet.');
      } else if (action === 'import') {
        if (!preview || !service) return;
        // Recheck revocation/expiry immediately before copying, not just when preview opened.
        const current = await service.preview(preview.token);
        const deck = local.addSharedDeck(current.deck);
        dialog.close(); status(''); window.showToast?.(`Copied ${deck.name} to your library.`);
      }
    } catch (error) {
      const message = ['PGRST202', 'PGRST205', '42P01'].includes(error?.code)
        ? 'Cloud sharing is not set up yet. Run the updated Supabase schema.sql.'
        : /fetch|network|offline|timeout|aborted/i.test(String(error?.message || ''))
          ? 'Cloud sharing is unavailable offline. Your local decks are safe.'
          : ['Enter a valid Recall share code or link.', 'This share link is invalid, expired, revoked, or deleted. Ask the owner for a new link.', 'Sign in to create or manage deck links.', 'Cloud sharing is not configured in this build.', 'Cloud sharing is not configured in this build. Use Export share file for offline sharing.', 'This deck was deleted.', 'The code is selected. Press Ctrl+C to copy it.'].includes(error?.message)
            ? error.message : 'Sharing failed. Check your connection and try again.';
      status(message, true);
    }
    finally { busy = false; }
  }
  dialog.addEventListener('click', async event => {
    const action = event.target.closest('[data-share-action]')?.dataset.shareAction;
    if (action === 'close') { dialog.close(); return; }
    if (action) { await act(action); return; }
    const token = event.target.closest('[data-share-open]')?.dataset.shareOpen;
    if (token) { el('shareCodeInput').value = token; await act('preview'); return; }
    const forget = event.target.closest('[data-share-forget]')?.dataset.shareForget;
    if (forget) { writeSaved(saved().filter(item => item.token !== forget)); renderSaved(); return; }
    const revoke = event.target.closest('[data-share-revoke]')?.dataset.shareRevoke;
    if (revoke && service) { try { await service.revoke(revoke); status('Link revoked. Existing recipients can no longer preview or copy it.'); await renderOwnerLinks(); } catch { status('Could not revoke this link. Check your connection and try again.', true); } }
  });
  dialog.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.id === 'shareCodeInput') { event.preventDefault(); act('preview'); } });
  document.querySelector('#openDeckShareBtn').addEventListener('click', () => open(local.activeDeck()?.id));
  document.querySelector('#sharedWithMeBtn').addEventListener('click', () => open());
  window.addEventListener('recall:share-deck', event => open(event.detail.deckId));
  // Only fragments are accepted on page load: query strings reach server logs.
  const incoming = new URLSearchParams(location.hash.replace(/^#/, '')).get('share');
  if (incoming) {
    const clean = new URL(location.href); clean.searchParams.delete('share'); clean.hash = '';
    history.replaceState(null, '', clean.pathname + clean.search);
    open(); el('shareCodeInput').value = incoming; act('preview');
  }
})();
