(function () {
  'use strict';
  const Core = window.RecallCatalogCore;
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, id, action, primary = false) => {
    const node = make('button', text, primary ? 'primary-button' : 'text-button');
    node.type = 'button'; node.id = id; node.onclick = action; return node;
  };
  function mount({ factory = window.RecallCloudClient, library = window.RecallLibrary } = {}) {
    const menu = document.querySelector('#settingsMenu');
    if (!factory?.enabled || !menu || !library || !Core) return null;
    let client;
    try { client = factory.create(); } catch { return null; }
    const service = window.RecallCatalogService.createService(client);
    const launcher = button('Admin web library', 'adminLibraryLauncher', open);
    launcher.className = 'settings-reset'; launcher.hidden = true; menu.append(launcher);
    const dialog = make('dialog', undefined, 'account-dialog admin-library-dialog'); dialog.id = 'adminLibraryDialog';
    dialog.setAttribute('aria-labelledby', 'adminLibraryTitle');
    const heading = make('h2', 'Admin web library'); heading.id = 'adminLibraryTitle';
    const close = button('Close', 'adminLibraryClose', () => { if (!busy) dialog.close(); });
    const header = make('header', undefined, 'account-head'); header.append(heading, close);
    const warning = make('p', 'All published card content, including notes, hints and accepted answers, becomes publicly visible and copyable. Publishing creates an immutable snapshot; your personal deck is not changed.', 'admin-library-warning');
    const content = make('div'); content.id = 'adminLibraryContent';
    const message = make('p'); message.id = 'adminLibraryMessage'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
    dialog.append(header, warning, content, message);
    const confirm = make('dialog', undefined, 'account-dialog admin-library-confirm'); confirm.id = 'adminLibraryConfirm'; confirm.setAttribute('aria-labelledby', 'adminLibraryConfirmTitle');
    const confirmTitle = make('h2', 'Step 4 of 4: Confirm public publication'); confirmTitle.id = 'adminLibraryConfirmTitle';
    const confirmWarning = make('p', 'This cannot be undone here. The snapshot will be publicly visible and may be copied by anyone.', 'admin-library-warning');
    const reviewed = make('input'); reviewed.type = 'checkbox'; reviewed.id = 'adminLibraryReviewed';
    const privacy = make('input'); privacy.type = 'checkbox'; privacy.id = 'adminLibraryPrivacy';
    const typed = make('input'); typed.type = 'text'; typed.id = 'adminLibraryTypedTitle'; typed.autocomplete = 'off';
    const reviewedLabel = make('label', undefined, 'admin-library-check'); reviewedLabel.append(reviewed, make('span', 'I reviewed every card and all publication metadata.'));
    const privacyLabel = make('label', undefined, 'admin-library-check'); privacyLabel.append(privacy, make('span', 'This deck contains no private or sensitive information and may be publicly copied.'));
    const typedLabel = make('label', undefined, 'admin-library-field'); typedLabel.append(make('span', 'Type the exact public deck title'), typed);
    const exactTitle = make('p'); exactTitle.id = 'adminLibraryExactTitle';
    const publish = button('Publish deck to web library', 'adminLibraryPublish', submit, true); publish.disabled = true;
    const cancel = button('Cancel', 'adminLibraryCancel', () => { if (!busy) confirm.close(); });
    const actions = make('div', undefined, 'admin-library-actions'); actions.append(cancel, publish);
    const confirmMessage = make('p'); confirmMessage.id = 'adminLibraryConfirmMessage'; confirmMessage.setAttribute('role', 'status'); confirmMessage.setAttribute('aria-live', 'polite');
    confirm.append(confirmTitle, confirmWarning, reviewedLabel, privacyLabel, exactTitle, typedLabel, actions, confirmMessage);
    document.body.append(dialog, confirm);
    let userId = null, sources = [], source = null, metadata = null, request = null, busy = false, generation = 0, disposed = false;
    const titles = { title: 'Public deck title', description: 'Description', qualification: 'Qualification', examBoard: 'Exam board', subject: 'Subject', topic: 'Specification topic', subtopic: 'Specification subtopic (optional)', version: 'Semantic version', verified: 'Verification status' };
    const limits = { title: 70, description: 500, examBoard: 80, subject: 100, topic: 120, subtopic: 120, version: 30 };
    const say = text => { message.textContent = text; };
    function confirmationsValid() {
      return !!request && reviewed.checked && privacy.checked && typed.value === request.metadata.title;
    }
    function updateConfirmation() { publish.disabled = busy || !userId || !confirmationsValid(); }
    for (const input of [reviewed, privacy, typed]) input.addEventListener('input', updateConfirmation);
    for (const modal of [dialog, confirm]) {
      modal.addEventListener('keydown', event => event.stopPropagation());
      modal.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    }
    confirm.addEventListener('close', () => { reviewed.checked = false; privacy.checked = false; typed.value = ''; updateConfirmation(); });
    dialog.addEventListener('close', () => { if (confirm.open) confirm.close(); launcher.focus(); });
    function step(title) { content.replaceChildren(make('h3', title)); say(''); }
    function selectDeck() {
      source = null; request = null; metadata = null;
      step('Step 1 of 4: Select your deck');
      const search = make('input'); search.type = 'search'; search.id = 'adminLibrarySearch'; search.placeholder = 'Search name or subject';
      const label = make('label', undefined, 'admin-library-field'); label.append(make('span', 'Search your Recall decks'), search);
      const list = make('div', undefined, 'admin-library-decks'); list.id = 'adminLibraryDecks';
      const count = make('p'); count.setAttribute('role', 'status');
      const render = () => {
        list.replaceChildren();
        const query = search.value.trim().toLowerCase();
        const visible = sources.filter(deck => `${deck.name} ${deck.subject}`.toLowerCase().includes(query));
        count.textContent = `${visible.length} personal deck${visible.length === 1 ? '' : 's'} found`;
        for (const deck of visible) {
          const item = button('', '', () => {
            // Freeze a detached source; later edits cannot change this publication.
            source = JSON.parse(JSON.stringify(deck));
            const previous = source.sourceLibrary || {};
            metadata = { title: source.name || '', description: source.description || '', qualification: ['GCSE', 'International GCSE'].includes(previous.qualification) ? previous.qualification : '',
              examBoard: previous.examBoard || '', subject: source.subject || '', topic: previous.topic || '', subtopic: previous.subtopic || '', version: '1.0.0', verified: false };
            editMetadata();
          });
          item.className = 'admin-library-deck'; item.dataset.sourceId = deck.id;
          item.append(make('strong', deck.name), make('span', `${deck.subject || 'General'} · ${deck.cards?.length || 0} cards`)); list.append(item);
        }
      };
      search.oninput = render; content.append(label, count, list); render(); search.focus();
    }
    function editMetadata() {
      request = null;
      step('Step 2 of 4: Review publication metadata');
      const form = make('form', undefined, 'admin-library-form'); form.id = 'adminLibraryMetadata';
      const fields = {};
      for (const key of Core.PUBLIC_METADATA) {
        const label = make('label', undefined, 'admin-library-field'); label.append(make('span', titles[key]));
        let input;
        if (key === 'qualification' || key === 'verified') {
          input = make('select');
          const values = key === 'qualification' ? [['', 'Choose a qualification'], ['GCSE', 'GCSE'], ['International GCSE', 'International GCSE']] : [['false', 'Unverified'], ['true', 'Verified']];
          for (const [value, text] of values) { const option = make('option', text); option.value = value; input.append(option); }
        } else { input = make(key === 'description' ? 'textarea' : 'input'); input.maxLength = limits[key]; }
        input.id = `adminLibrary-${key}`; input.name = key; input.value = String(metadata[key]); input.required = key !== 'subtopic';
        label.append(input); form.append(label); fields[key] = input;
      }
      const back = button('Back to decks', 'adminLibrarySelectBack', selectDeck);
      const next = button('Validate and preview', 'adminLibraryPreviewNext', () => {}, true); next.type = 'submit';
      const actions = make('div', undefined, 'admin-library-actions'); actions.append(back, next); form.append(actions);
      form.onsubmit = event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        metadata = Object.fromEntries(Core.PUBLIC_METADATA.map(key => [key, key === 'verified' ? fields[key].value === 'true' : fields[key].value]));
        try {
          const clean = Core.preparePublication(metadata, source);
          request = { ...clean, idempotencyKey: crypto.randomUUID() }; metadata = clean.metadata; showPreview();
        } catch (error) { say(error.message); }
      };
      content.append(form); fields.title.focus();
    }
    function showPreview() {
      step('Step 3 of 4: Review the public snapshot');
      const details = make('dl', undefined, 'admin-library-details');
      for (const key of Core.PUBLIC_METADATA) { details.append(make('dt', titles[key]), make('dd', key === 'verified' ? (metadata[key] ? 'Verified' : 'Unverified') : metadata[key] || 'Not applicable')); }
      details.append(make('dt', 'Total cards'), make('dd', String(request.deck.cards.length)));
      details.append(make('dt', 'Deck domain'), make('dd', request.deck.domain), make('dt', 'Language'), make('dd', request.deck.language?.name || 'Not applicable'));
      const cards = make('div', undefined, 'admin-library-cards'); cards.id = 'adminLibraryPreviewCards';
      for (const [index, card] of request.deck.cards.entries()) {
        const article = make('article'); article.append(make('h4', `${index + 1}. ${card.front}`), make('p', card.back));
        if (card.notes) article.append(make('p', `Notes: ${card.notes}`));
        if (card.hint) article.append(make('p', `Hint: ${card.hint}`));
        if (card.acceptedAnswers.length) article.append(make('p', `Accepted answers: ${card.acceptedAnswers.join('; ')}`));
        article.append(make('small', `Word information: ${card.wordInfo.gender}${card.wordInfo.originalMarker ? '; ' + card.wordInfo.originalMarker : ''}${card.wordInfo.partOfSpeech ? '; ' + card.wordInfo.partOfSpeech : ''}`)); cards.append(article);
      }
      const back = button('Edit metadata', 'adminLibraryEditMetadata', editMetadata);
      const next = button('Continue to final confirmation', 'adminLibraryConfirmNext', () => {
        exactTitle.textContent = request.metadata.title; confirmMessage.textContent = ''; updateConfirmation(); confirm.showModal(); reviewed.focus();
      }, true);
      const actions = make('div', undefined, 'admin-library-actions'); actions.append(back, next);
      content.append(details, make('p', 'Review every card below, including notes, hints and alternatives.'), cards, actions); next.focus();
    }
    async function submit() {
      if (busy || !userId || !confirm.open || !confirmationsValid()) return;
      busy = true; updateConfirmation(); cancel.disabled = true; close.disabled = true;
      confirm.setAttribute('aria-busy', 'true'); confirmMessage.textContent = 'Publishing the reviewed snapshot…';
      const current = generation, owner = userId;
      try {
        const result = await service.publish(request, owner);
        if (current !== generation || owner !== userId) return;
        confirm.close();
        step('Publication successful');
        say(`Published “${result.title}” to the web library: ${result.cardCount} cards, v${result.version}. ${result.replayed ? 'Your earlier request already succeeded; no second copy was created.' : 'Your personal deck is unchanged.'}`);
        request = null;
        window.dispatchEvent(new CustomEvent('recall:catalog-published', { detail: { id: result.id } }));
        close.focus();
      } catch (error) { if (current === generation) confirmMessage.textContent = error.message; }
      finally { busy = false; cancel.disabled = false; close.disabled = false; confirm.removeAttribute('aria-busy'); updateConfirmation(); }
    }
    function open() {
      if (!userId || busy) return;
      try { sources = library.catalogSources(); }
      catch { return; }
      dialog.showModal(); selectDeck();
    }
    async function refreshAccess() {
      const current = ++generation;
      try {
        const id = await service.access();
        if (disposed || current !== generation) return;
        if (id !== userId) { if (confirm.open) confirm.close(); if (dialog.open) dialog.close(); request = null; }
        userId = id; launcher.hidden = !id;
      } catch {
        if (disposed || current !== generation) return;
        userId = null; launcher.hidden = true; request = null;
        if (confirm.open) confirm.close(); if (dialog.open) dialog.close();
      }
    }
    const subscription = client.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') return;
      // Never await another auth call inside Supabase's auth callback.
      setTimeout(refreshAccess, 0);
    });
    refreshAccess();
    return { refreshAccess, destroy() { disposed = true; ++generation; subscription?.data?.subscription?.unsubscribe(); launcher.remove(); dialog.remove(); confirm.remove(); } };
  }
  window.RecallAdminLibrary = { mount };
  mount();
})();
