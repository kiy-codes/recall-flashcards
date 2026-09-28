(function () {
  'use strict';
  const page = document.querySelector('#catalogLibrary');
  const openButton = document.querySelector('#browseCatalogBtn');
  if (!page || !openButton) return;
  const bundled = window.RecallCatalogData?.entries;
  let entries = Array.isArray(bundled) ? [...bundled] : [];
  let byId = new Map(entries.map(entry => [entry.id, entry]));
  let loading = false;
  const remoteStatus = page.querySelector('#catalogRemoteStatus');
  const search = page.querySelector('#catalogSearch');
  const grid = page.querySelector('#catalogGrid');
  const preview = page.querySelector('#catalogPreview');
  const status = page.querySelector('#catalogStatus');
  const fields = { qualification: page.querySelector('#catalogQualification'), examBoard: page.querySelector('#catalogBoard'), subject: page.querySelector('#catalogSubject'), topic: page.querySelector('#catalogTopic'), subtopic: page.querySelector('#catalogSubtopic') };
  let selected = null;
  function fillFilters() {
    for (const [key, select] of Object.entries(fields)) {
      const previous = select.value;
      select.replaceChildren();
      const all = document.createElement('option'); all.value = ''; all.textContent = `All ${key === 'examBoard' ? 'exam boards' : key === 'qualification' ? 'qualifications' : key === 'subject' ? 'subjects' : key === 'subtopic' ? 'subtopics' : 'topics'}`; select.append(all);
      for (const value of [...new Set(entries.map(entry => entry[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b))) {
        const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option);
      }
      select.value = [...select.options].some(option => option.value === previous) ? previous : '';
    }
  }
  function matches(entry) {
    const query = search.value.trim().toLocaleLowerCase();
    if (query && ![entry.title, entry.description, entry.qualification, entry.examBoard, entry.subject, entry.topic, entry.subtopic].some(value => value.toLocaleLowerCase().includes(query))) return false;
    return Object.entries(fields).every(([key, select]) => !select.value || entry[key] === select.value);
  }
  function renderResults() {
    grid.replaceChildren();
    if (!Array.isArray(entries)) { status.textContent = 'The built-in library is unavailable in this build.'; return; }
    const visible = entries.filter(matches);
    status.textContent = `${visible.length} deck${visible.length === 1 ? '' : 's'} found`;
    const groups = new Map();
    for (const entry of visible.sort((a, b) => a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title))) {
      if (!groups.has(entry.subject)) groups.set(entry.subject, new Map());
      const topics = groups.get(entry.subject);
      if (!topics.has(entry.topic)) topics.set(entry.topic, []);
      topics.get(entry.topic).push(entry);
    }
    let subjectIndex = 0;
    for (const [subject, topics] of groups) {
      const section = document.createElement('section'); section.className = 'catalog-subject-group';
      const heading = document.createElement('h2'); heading.id = `catalog-subject-${subjectIndex}`; heading.textContent = subject;
      section.setAttribute('aria-labelledby', heading.id);
      const subjectCount = [...topics.values()].reduce((count, decks) => count + decks.length, 0);
      const count = document.createElement('small'); count.textContent = `${subjectCount} deck${subjectCount === 1 ? '' : 's'}`;
      const subjectHead = document.createElement('div'); subjectHead.className = 'catalog-group-head'; subjectHead.append(heading, count);
      section.append(subjectHead);
      for (const [topic, decks] of topics) {
        const topicSection = document.createElement('section'); topicSection.className = 'catalog-topic-group';
        topicSection.setAttribute('aria-label', topic);
        const cards = document.createElement('div'); cards.className = 'deck-grid catalog-topic-grid';
        for (const entry of decks) {
          const article = document.createElement('article'); article.className = 'deck-grid-card catalog-card';
          const title = document.createElement('h3'); title.textContent = entry.title;
          const route = document.createElement('p'); route.textContent = `${entry.qualification} · ${entry.examBoard}${entry.subtopic ? ' · ' + entry.subtopic : ''}`;
          const description = document.createElement('p'); description.textContent = entry.description;
          const meta = document.createElement('small'); meta.textContent = `${entry.cardCount} cards · v${entry.version} · ${entry.verified ? 'Verified' : 'Unverified sample'}`;
          const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = 'Preview cards'; button.dataset.catalogId = entry.id;
          article.append(title, route, description, meta, button); cards.append(article);
        }
        topicSection.append(cards); section.append(topicSection);
      }
      grid.append(section);
      subjectIndex += 1;
    }
    if (!visible.length) { const empty = document.createElement('p'); empty.className = 'library-empty'; empty.textContent = 'No decks match these filters.'; grid.append(empty); }
  }
  function showPreview(id) {
    const entry = byId.get(id); if (!entry) return;
    selected = entry;
    page.querySelector('#catalogError').hidden = true;
    page.querySelector('#catalogPreviewTitle').textContent = entry.title;
    page.querySelector('#catalogPreviewMeta').textContent = `${entry.qualification} · ${entry.examBoard} · ${entry.subject} · ${entry.topic}${entry.subtopic ? ' / ' + entry.subtopic : ''} · ${entry.cardCount} cards · v${entry.version} · ${entry.verified ? 'Verified' : 'Unverified sample'}`;
    page.querySelector('#catalogPreviewDescription').textContent = entry.description;
    const cards = page.querySelector('#catalogPreviewCards'); cards.replaceChildren();
    for (const card of entry.cards.slice(0, 20)) {
      const article = document.createElement('article');
      const front = document.createElement('strong'); front.textContent = card.front;
      const back = document.createElement('p'); back.textContent = card.back;
      article.append(front, back); cards.append(article);
    }
    if (entry.cards.length > 20) { const note = document.createElement('p'); note.textContent = `Showing the first 20 of ${entry.cards.length} cards.`; cards.append(note); }
    grid.hidden = true; preview.hidden = false; preview.scrollIntoView({ block: 'start' });
    page.querySelector('#catalogBack').focus();
  }
  function backToResults() { selected = null; preview.hidden = true; grid.hidden = false; search.focus(); }
  async function loadRemote() {
    const factory = window.RecallCloudClient;
    if (loading || !factory?.enabled) return;
    loading = true;
    remoteStatus.hidden = false; remoteStatus.textContent = 'Checking the online library…';
    try {
      const service = window.RecallCatalogService.createService(factory.create());
      const rows = await service.load();
      const merged = window.RecallCatalogCore.mergeCatalogs(bundled || [], rows);
      entries = merged; byId = new Map(entries.map(entry => [entry.id, entry]));
      fillFilters(); renderResults();
      remoteStatus.textContent = ''; remoteStatus.hidden = true;
    } catch {
      remoteStatus.textContent = 'Online library unavailable. Bundled decks are still available.';
    } finally { loading = false; }
  }
  function close() { page.hidden = true; backToResults(); openButton.focus(); }
  openButton.addEventListener('click', () => {
    page.hidden = false;
    if (Array.isArray(entries)) { fillFilters(); renderResults(); }
    else status.textContent = 'The built-in library is unavailable in this build.';
    page.scrollTop = 0; search.focus();
    loadRemote();
  });
  page.querySelector('#catalogClose').addEventListener('click', close);
  page.querySelector('#catalogBack').addEventListener('click', backToResults);
  search.addEventListener('input', renderResults);
  for (const select of Object.values(fields)) select.addEventListener('change', renderResults);
  grid.addEventListener('click', event => { const id = event.target.closest('[data-catalog-id]')?.dataset.catalogId; if (id) showPreview(id); });
  page.querySelector('#catalogAdd').addEventListener('click', () => {
    if (!selected) return;
    const button = page.querySelector('#catalogAdd'); button.disabled = true;
    try { window.RecallLibrary.addCatalogDeck(selected); page.hidden = true; selected = null; preview.hidden = true; grid.hidden = false; }
    catch { const error = page.querySelector('#catalogError'); error.textContent = 'Could not save this deck. Check available storage and try again.'; error.hidden = false; }
    finally { button.disabled = false; }
  });
  page.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); if (!preview.hidden) backToResults(); else close(); } });
  window.addEventListener('recall:catalog-published', loadRemote);
})();
