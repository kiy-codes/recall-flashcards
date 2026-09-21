const STORAGE_KEY = 'recall-library-v2';

const state = {
  sets: [],
  folders: [],
  activeSetId: null,
  queue: [],
  currentIndex: 0,
  startSide: 'front',
  flipped: false,
  shuffled: true,
  correct: 0,
  retry: 0,
  animating: false,
  history: [],
  sessionHistory: [],
  reviewLog: [],
  testHistory: [],
  activeTest: null,
  currentSession: null,
  repeatMissed: false,
  sessionRepeatedIds: new Set(),
  studyFilter: 'all',
  studyMode: 'flip',
  typedChecked: false,
  activity: {},
  selectedCardIds: new Set(),
  selectingCards: false,
  deckSearch: '',
  selectedTags: [],
  editingCardId: null,
  importDraft: null,
  hintRevealed: false,
  cardPresentedAt: null,
  theme: 'system',
  subjectColors: {},
  keybinds: { flip: 'w', retry: 'a', correct: 'd', undo: 'z' },
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  card: $('#flashcard'), cardContent: $('#cardContent'), cardSideLabel: $('#cardSideLabel'), cardPosition: $('#cardPosition'),
  correct: $('#correctBtn'), retry: $('#retryBtn'), correctCount: $('#correctCount'), retryCount: $('#retryCount'), progressText: $('#progressText'), progressBar: $('#progressBar'),
  sessionScore: $('#sessionScore'), undo: $('#undoBtn'), fullscreen: $('#fullscreenBtn'), exitFocus: $('#exitFocusBtn'), bestAccuracy: $('#bestAccuracy'), accuracyChange: $('#accuracyChange'), progressChart: $('#progressChart'), chartEmpty: $('#chartEmpty'), currentStreak: $('#currentStreak'), longestStreak: $('#longestStreak'), heatmapMonths: $('#heatmapMonths'), heatmapGrid: $('#heatmapGrid'), heatmapTip: $('#heatmapTip'),
  deckName: $('#deckName'), cardCount: $('#cardCount'), deckList: $('#deckList'), emptyDeck: $('#emptyDeck'), clearDeck: $('#clearDeckBtn'),
  frontInput: $('#frontInput'), backInput: $('#backInput'), tagsInput: $('#tagsInput'), hintInput: $('#hintInput'), notesInput: $('#notesInput'), importInput: $('#importInput'), importFormat: $('#importFormat'), importStatus: $('#importStatus'), fileImport: $('#fileImportInput'), sessionMenuBtn: $('#sessionMenuBtn'), sessionMenu: $('#sessionMenu'), sessionShuffle: $('#sessionShuffle'), repeatMissed: $('#repeatMissed'), studyFilter: $('#studyFilter'), studyMode: $('#studyMode'), applySession: $('#applySessionBtn'), toast: $('#toast'), flag: $('#flagBtn'), cardState: $('#cardState'), typedForm: $('#typedAnswerForm'), typedInput: $('#typedAnswerInput'), typedPrompt: $('#typedPrompt'), typedFeedback: $('#typedFeedback'), typedSubmit: $('#typedSubmitBtn'), studyHint: $('#studyHint'), revealHint: $('#revealHintBtn'), hintText: $('#hintText'),
  deckSearch: $('#deckSearch'), clearSearch: $('#clearSearchBtn'), tagFilter: $('#tagFilter'), manageTags: $('#manageTagsBtn'), selectCards: $('#selectCardsBtn'), selectionCount: $('#selectionCount'), bulkActions: $('#bulkActions'), bulkTag: $('#bulkTagBtn'), bulkRemoveTag: $('#bulkRemoveTagBtn'), bulkMoveDeck: $('#bulkMoveDeck'), bulkDuplicate: $('#bulkDuplicateBtn'), bulkDelete: $('#bulkDeleteBtn'), exportDeck: $('#exportDeckBtn'), exportTsv: $('#exportTsvBtn'), shareDeckSelect: $('#shareDeckSelect'), shareDecks: $('#shareDecksBtn'), cardEditor: $('#cardEditorDialog'), cardEditorForm: $('#cardEditorForm'), cardEditorCancel: $('#cardEditorCancel'), editFront: $('#editFrontInput'), editBack: $('#editBackInput'), editTags: $('#editTagsInput'), editHint: $('#editHintInput'), editNotes: $('#editNotesInput'), tagDialog: $('#tagDialog'), tagDialogList: $('#tagManagerList'), tagDialogClose: $('#tagDialogClose'), newTag: $('#newTagBtn'), importPreview: $('#importPreviewDialog'), importPreviewClose: $('#importPreviewClose'), importPreviewCancel: $('#importPreviewCancel'), importPreviewRows: $('#importPreviewRows'), importPreviewSummary: $('#importPreviewSummary'), mapFront: $('#mapFront'), mapBack: $('#mapBack'), mapTags: $('#mapTags'), mapNotes: $('#mapNotes'), mapHint: $('#mapHint'), importDestination: $('#importDestination'), shareImportModeWrap: $('#shareImportModeWrap'), shareImportMode: $('#shareImportMode'), duplicateMode: $('#duplicateMode'), confirmImport: $('#confirmImportBtn'),
  frontSegment: $('#frontSegment'), backSegment: $('#backSegment'), frontLabelInput: $('#frontLabelInput'), backLabelInput: $('#backLabelInput'), frontInputLabel: $('#frontInputLabel'), backInputLabel: $('#backInputLabel'),
  drawer: $('#libraryDrawer'), scrim: $('#drawerScrim'), libraryTree: $('#libraryTree'), librarySearch: $('#librarySearch'), librarySort: $('#librarySort'), fullLibrary: $('#fullLibrary'), fullLibraryGrid: $('#fullLibraryGrid'), fullLibrarySearch: $('#fullLibrarySearch'), fullLibrarySort: $('#fullLibrarySort'), attemptsDrawer: $('#attemptsDrawer'), attemptsScrim: $('#attemptsScrim'), attemptsList: $('#attemptsList'), attemptsSubtitle: $('#attemptsSubtitle'), dialog: $('#libraryDialog'), dialogForm: $('#libraryDialogForm'), dialogEyebrow: $('#libraryDialogEyebrow'), dialogTitle: $('#libraryDialogTitle'), dialogLabel: $('#libraryDialogLabel'), dialogInput: $('#libraryDialogInput'), dialogCancel: $('#libraryDialogCancel'), dialogSave: $('#libraryDialogSave'),
};

elements.shareDeckOptions = $('#shareDeckOptions');
elements.shareDeckSummary = $('#shareDeckSummary');
elements.tagFilterOptions = $('#tagFilterOptions');
elements.tagFilterSummary = $('#tagFilterSummary');
elements.settingsBtn = $('#settingsBtn'); elements.settingsMenu = $('#settingsMenu'); elements.themeSelect = $('#themeSelect'); elements.keybindFlip = $('#keybindFlip'); elements.keybindRetry = $('#keybindRetry'); elements.keybindCorrect = $('#keybindCorrect'); elements.keybindUndo = $('#keybindUndo'); elements.resetKeybinds = $('#resetKeybindsBtn');
const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const FOLDER_COLORS = ['#2447c2', '#bc5b55', '#3c9a88', '#a56b1d', '#7955ad', '#437cba'];
let libraryDialogAction = null;
const activeSet = () => state.sets.find(set => set.id === state.activeSetId) || state.sets[0];
const activeCards = () => activeSet()?.cards || [];
const sideNames = (set) => ({ front: set?.frontLabel?.trim() || 'First side', back: set?.backLabel?.trim() || 'Second side' });
const CARD_STATES = ['New', 'Learning', 'Mastered'];
const cleanTags = (value) => Array.from(new Set((Array.isArray(value) ? value : String(value || '').split(',')).map(tag => String(tag).trim()).filter(Boolean)));
const normaliseCard = (card) => RecallScheduler.migrateCard({ ...card, id: card.id || makeId(), state: CARD_STATES.includes(card.state) ? card.state : 'New', flagged: Boolean(card.flagged), missed: Boolean(card.missed), correctStreak: Number.isFinite(card.correctStreak) ? card.correctStreak : 0, reviewCount: Number.isFinite(card.reviewCount) ? card.reviewCount : 0, tags: cleanTags(card.tags), notes: String(card.notes || ''), hint: String(card.hint || '') });

const DEFAULT_KEYBINDS = { flip: 'w', retry: 'a', correct: 'd', undo: 'z' };
function applyTheme() {
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = state.theme === 'system' ? systemTheme : state.theme;
  elements.themeSelect.value = state.theme;
}
function renderKeybinds() { elements.keybindFlip.value = state.keybinds.flip.toUpperCase(); elements.keybindRetry.value = state.keybinds.retry.toUpperCase(); elements.keybindCorrect.value = state.keybinds.correct.toUpperCase(); elements.keybindUndo.value = state.keybinds.undo.toUpperCase(); }
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ sets: state.sets, folders: state.folders, activeSetId: state.activeSetId, sessionHistory: state.sessionHistory, testHistory: state.testHistory, reviewLog: state.reviewLog, currentSession: state.currentSession, activity: state.activity, shuffled: state.shuffled, repeatMissed: state.repeatMissed, studyFilter: state.studyFilter, studyMode: state.studyMode, theme: state.theme, keybinds: state.keybinds, subjectColors: state.subjectColors }));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.sets?.length) {
      state.sets = saved.sets.map((set, index) => ({ ...set, tags: cleanTags(set.tags), primarySubject: typeof set.primarySubject === 'string' ? set.primarySubject : null, frontLabel: set.frontLabel || 'First side', backLabel: set.backLabel || 'Second side', order: Number.isFinite(set.order) ? set.order : index, createdAt: set.createdAt || Date.now() + index, cards: Array.isArray(set.cards) ? set.cards.map(normaliseCard) : [] }));
      state.folders = Array.isArray(saved.folders) ? saved.folders.map((folder, index) => ({ ...folder, order: Number.isFinite(folder.order) ? folder.order : index, color: folder.color || FOLDER_COLORS[index % FOLDER_COLORS.length] })) : [];
      state.activeSetId = state.sets.some(set => set.id === saved.activeSetId) ? saved.activeSetId : state.sets[0].id;
      state.shuffled = saved.shuffled !== false;
      state.sessionHistory = Array.isArray(saved.sessionHistory) ? saved.sessionHistory.filter(item => Number.isFinite(item.attempts) && Number.isFinite(item.correct)) : (Array.isArray(saved.performance) ? saved.performance.filter(item => Number.isFinite(item.total) && Number.isFinite(item.correct)).map((item, index) => ({ id: `legacy-${index}`, deckId: null, deckName: 'Previous study', startedAt: `${item.date}T12:00:00`, endedAt: `${item.date}T12:00:00`, attempts: item.total, correct: item.correct, retry: Math.max(0, item.total - item.correct) })) : []);
      state.testHistory = Array.isArray(saved.testHistory) ? saved.testHistory.filter(item => Array.isArray(item.questions) && Array.isArray(item.answers)) : [];
      state.reviewLog = Array.isArray(saved.reviewLog) ? saved.reviewLog.filter(item => item && item.cardId && item.timestamp && ['correct', 'retry'].includes(item.outcome)) : [];
      state.currentSession = saved.currentSession?.attempts ? { learned: 0, ...saved.currentSession } : null;
      state.activity = saved.activity && typeof saved.activity === 'object' ? saved.activity : {};
      state.repeatMissed = Boolean(saved.repeatMissed); state.studyFilter = ['all', 'due', 'flagged', 'missed', 'new', 'learning'].includes(saved.studyFilter) ? saved.studyFilter : 'all'; state.studyMode = saved.studyMode === 'typed' ? 'typed' : 'flip';
      state.theme = ['system', 'light', 'dark'].includes(saved.theme) ? saved.theme : 'system'; state.keybinds = { ...state.keybinds, ...(saved.keybinds || {}) };
      state.subjectColors = saved.subjectColors && typeof saved.subjectColors === 'object' ? saved.subjectColors : {};
    } else {
      const legacy = JSON.parse(localStorage.getItem('recall-flashcards-v1'));
      const cards = Array.isArray(legacy?.cards) ? legacy.cards : [];
      const set = { id: makeId(), name: 'My study deck', folderId: null, frontLabel: 'First side', backLabel: 'Second side', order: 0, createdAt: Date.now(), cards: cards.filter(card => card.front && card.back).map(normaliseCard) };
      state.sets = [set]; state.activeSetId = set.id; state.shuffled = legacy?.shuffled !== false;
      if (cards.length) save();
    }
  } catch { localStorage.removeItem(STORAGE_KEY); }
  if (!state.sets.length) {
    const set = { id: makeId(), name: 'My study deck', folderId: null, frontLabel: 'First side', backLabel: 'Second side', order: 0, createdAt: Date.now(), cards: [] };
    state.sets = [set]; state.activeSetId = set.id;
  }
  elements.sessionShuffle.checked = state.shuffled; elements.repeatMissed.checked = state.repeatMissed; elements.studyFilter.value = state.studyFilter; elements.studyMode.value = state.studyMode;
  applyTheme(); renderKeybinds(); buildQueue();
}

function shuffledCopy(cards) {
  const items = [...cards];
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}

function startNewSession() {
  const set = activeSet();
  state.currentSession = { id: makeId(), deckId: set?.id || null, deckName: set?.name || 'Study set', startedAt: new Date().toISOString(), attempts: 0, correct: 0, retry: 0, learned: 0, filter: state.studyFilter, mode: state.studyMode };
}

function finishCurrentSession() {
  if (state.currentSession?.attempts) {
    state.sessionHistory.push({ ...state.currentSession, endedAt: new Date().toISOString() });
    save();
  }
  state.currentSession = null;
}

function cardsForStudy() {
  let cards = activeCards();
  if (state.selectedTags.length) cards = cards.filter(card => state.selectedTags.every(tag => card.tags.includes(tag)));
  if (state.studyFilter === 'flagged') return cards.filter(card => card.flagged);
  if (state.studyFilter === 'due') return cards.filter(card => RecallScheduler.isDue(card));
  if (state.studyFilter === 'missed') return cards.filter(card => card.missed);
  if (state.studyFilter === 'new') return cards.filter(card => card.state === 'New');
  if (state.studyFilter === 'learning') return cards.filter(card => card.state === 'Learning');
  return cards;
}

function buildQueue() {
  finishCurrentSession();
  const eligible = cardsForStudy();
  state.queue = state.shuffled ? shuffledCopy(eligible) : [...eligible];
  state.currentIndex = 0; state.flipped = false; state.correct = 0; state.retry = 0; state.animating = false; state.history = []; state.sessionRepeatedIds = new Set(); state.typedChecked = false; state.hintRevealed = false; state.cardPresentedAt = Date.now();
  startNewSession();
  render();
}

function currentCard() { return state.queue[state.currentIndex]; }

function render() {
  const card = currentCard(); const total = state.queue.length; const completed = state.correct + state.retry; const set = card && state.testStudyContext ? studySetForCard(card) : activeSet(); const names = sideNames(set);
  elements.deckName.textContent = set?.name || 'My study deck';
  elements.frontSegment.textContent = names.front; elements.backSegment.textContent = names.back;
  elements.frontLabelInput.value = names.front; elements.backLabelInput.value = names.back;
  elements.frontInputLabel.textContent = names.front; elements.backInputLabel.textContent = names.back;
  elements.cardCount.textContent = `${activeCards().length} ${activeCards().length === 1 ? 'card' : 'cards'}`;
  elements.progressText.textContent = `${Math.min(completed, total)} / ${total}`;
  elements.progressBar.style.width = total ? `${(Math.min(completed, total) / total) * 100}%` : '0%';
  elements.correctCount.textContent = state.correct; elements.retryCount.textContent = state.retry;
  elements.sessionScore.textContent = completed ? `${Math.round((state.correct / completed) * 100)}%` : '—';
  elements.clearDeck.disabled = !activeCards().length; elements.emptyDeck.hidden = state.sets.some(item => item.cards.length > 0);
  const streak = studyStreaks(); elements.currentStreak.textContent = `${streak.current} ${streak.current === 1 ? 'day' : 'days'}`; elements.longestStreak.textContent = `Best: ${streak.longest}`;
  elements.studyFilter.value = state.studyFilter; elements.studyMode.value = state.studyMode;
  elements.card.classList.toggle('empty', !card); elements.correct.disabled = !card || state.animating || state.studyMode === 'typed'; elements.retry.disabled = !card || state.animating || state.studyMode === 'typed'; elements.undo.disabled = !state.history.length || state.animating;
  elements.flag.disabled = !card || state.animating; elements.flag.textContent = card?.flagged ? '★ Flagged' : '☆ Flag'; elements.cardState.textContent = card?.state?.toUpperCase() || 'READY'; elements.cardState.className = `card-state ${(card?.state || 'ready').toLowerCase()}`;
  elements.studyHint.hidden = !card?.hint; elements.revealHint.textContent = state.hintRevealed ? 'Hide hint' : 'Show hint'; elements.hintText.textContent = state.hintRevealed ? card?.hint || '' : '';
  elements.typedForm.hidden = state.studyMode !== 'typed' || !card; elements.typedInput.disabled = !card || Boolean(state.typedChecked) || state.animating; elements.typedSubmit.textContent = state.typedChecked ? 'Next card' : 'Check';
  if (!card) {
    const noDueCards = state.studyFilter === 'due' && activeCards().length && !total;
    elements.cardPosition.textContent = noDueCards ? 'NO CARDS DUE' : activeCards().length ? 'SESSION COMPLETE' : 'ADD CARDS TO BEGIN';
    elements.cardSideLabel.textContent = noDueCards ? 'ALL CAUGHT UP' : activeCards().length ? 'NICE WORK' : 'YOUR DECK';
    elements.cardContent.textContent = noDueCards ? 'There are no cards due right now. Switch to All cards to study ahead, or come back when your next review is due.' : activeCards().length ? `You reviewed ${completed} ${completed === 1 ? 'card' : 'cards'}. Reset progress to study again.` : 'Add a card below, or paste in a list to make a deck in seconds.';
  } else {
    const showFront = state.flipped ? state.startSide !== 'front' : state.startSide === 'front';
    elements.cardPosition.textContent = `CARD ${state.currentIndex + 1} OF ${total}`;
    elements.cardSideLabel.textContent = `${showFront ? names.front : names.back} · ${showFront ? 'PROMPT' : 'ANSWER'}`;
    elements.cardContent.textContent = showFront ? card.front : card.back;
    const expected = showFront ? card.back : card.front; elements.typedPrompt.textContent = `Type the ${showFront ? names.back : names.front}`;
    if (state.typedChecked) { elements.typedFeedback.textContent = `${state.typedChecked.accepted ? 'Correct' : 'Not quite'} — expected: ${expected}`; elements.typedFeedback.className = `typed-feedback ${state.typedChecked.accepted ? 'accepted' : 'rejected'}`; } else { elements.typedFeedback.textContent = ''; elements.typedFeedback.className = 'typed-feedback'; }
  }
  renderDeck(); renderLibrary(); renderInsights(); renderHeatmap();
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]); }

function renderDeck() {
  elements.deckList.innerHTML = '';
  const allTags = Array.from(new Set(activeCards().flatMap(card => card.tags))).sort((a, b) => a.localeCompare(b));
  elements.tagFilterOptions.innerHTML = allTags.length ? allTags.map(tag => `<label><input type="checkbox" value="${escapeHtml(tag)}" ${state.selectedTags.includes(tag) ? 'checked' : ''}/><span>${escapeHtml(tag)}</span></label>`).join('') : '<span class="picker-empty">No tags in this deck</span>';
  elements.tagFilterSummary.textContent = state.selectedTags.length ? `${state.selectedTags.length} selected` : 'All tags';
  elements.bulkMoveDeck.innerHTML = state.sets.filter(set => set.id !== activeSet()?.id).map(set => `<option value="${set.id}">${escapeHtml(set.name)}</option>`).join('');
  elements.shareDeckOptions.innerHTML = state.sets.map(set => `<label><input type="checkbox" value="${set.id}" ${set.id === activeSet()?.id ? 'checked' : ''}/><span>${escapeHtml(set.name)}</span></label>`).join('');
  const sharedCount = elements.shareDeckOptions.querySelectorAll('input:checked').length; elements.shareDeckSummary.textContent = `${sharedCount} selected`;
  elements.selectCards.textContent = state.selectingCards ? 'Done selecting' : 'Select cards'; elements.selectionCount.textContent = `${state.selectedCardIds.size} selected`; elements.bulkActions.hidden = !state.selectingCards;
  const term = state.deckSearch.trim().toLocaleLowerCase();
  const visible = activeCards().filter(card => (!term || [card.front, card.back, card.notes, card.hint, ...card.tags].join(' ').toLocaleLowerCase().includes(term)) && (!state.selectedTags.length || state.selectedTags.every(tag => card.tags.includes(tag))));
  visible.forEach(card => {
    const item = document.createElement('article'); item.className = 'deck-item';
    if (state.selectingCards && state.selectedCardIds.has(card.id)) item.classList.add('selected');
    item.innerHTML = `${state.selectingCards ? `<label class="card-check"><input type="checkbox" data-select-card="${card.id}" ${state.selectedCardIds.has(card.id) ? 'checked' : ''} aria-label="Select card" /></label>` : ''}<span class="side front-side" title="${escapeHtml(card.front)}">${escapeHtml(card.front)}</span><span class="side back-side" title="${escapeHtml(card.back)}">${escapeHtml(card.back)}</span><span class="deck-card-state ${card.state.toLowerCase()}">${escapeHtml(card.state)}</span>${card.flagged ? '<span class="deck-flag" title="Flagged">★</span>' : ''}<span class="card-tags">${card.tags.map(tag => `<i>${escapeHtml(tag)}</i>`).join('')}</span>${card.hint ? '<span class="card-detail" title="Has hint">⌁</span>' : ''}${card.notes ? '<span class="card-detail" title="Has notes">▤</span>' : ''}<button class="edit-card" type="button" data-edit="${card.id}">Edit</button><button class="delete-card" type="button" data-delete="${card.id}" aria-label="Delete card">×</button>`;
    elements.deckList.append(item);
  });
  if (!visible.length && activeCards().length) elements.deckList.innerHTML = '<p class="deck-no-results">No cards match your search or tag filters.</p>';
}

function renderInsights() {
  const chartColors = document.documentElement.dataset.theme === 'dark'
    ? { grid: '#526580', label: '#aeb9cf', accent: '#77d8c9', point: '#87a5ff', surface: '#17223b' }
    : { grid: '#dfe1e8', label: '#69748b', accent: '#71d6c8', point: '#2447c2', surface: '#faf8f3' };
  const sessions = [...state.sessionHistory, ...(state.currentSession?.attempts ? [{ ...state.currentSession, inProgress: true }] : [])];
  const rates = sessions.map(item => item.attempts ? (item.correct / item.attempts) * 100 : 0);
  const best = rates.length ? Math.round(Math.max(...rates)) : null;
  const change = rates.length > 1 ? Math.round(rates[rates.length - 1] - rates[0]) : null;
  elements.bestAccuracy.textContent = best === null ? '—' : `${best}%`;
  elements.accuracyChange.textContent = change === null ? 'Complete another session to compare.' : `${change >= 0 ? '+' : ''}${change}% from your first session`;
  const data = sessions.slice(-10);
  elements.chartEmpty.hidden = data.length > 0;
  if (!data.length) { elements.progressChart.innerHTML = ''; return; }
  const width = 560, left = 34, right = 12, top = 13, bottom = 35, graphHeight = 124;
  const step = data.length === 1 ? 0 : (width - left - right) / (data.length - 1);
  const points = data.map((item, index) => {
    const rate = item.attempts ? item.correct / item.attempts : 0;
    return { x: left + step * index, y: top + (1 - rate) * graphHeight, rate, ...item };
  });
  const grid = [0, 50, 100].map(value => { const y = top + (1 - value / 100) * graphHeight; return `<path d="M ${left} ${y} H ${width - right}" stroke="${chartColors.grid}" stroke-width="1"/><text x="0" y="${y + 3}" fill="${chartColors.label}" font-size="9" font-family="DM Mono">${value}</text>`; }).join('');
  const pointString = points.map(point => `${point.x},${point.y}`).join(' ');
  const sessionDate = point => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(point.endedAt || point.startedAt));
  const dots = points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="4.5" fill="${point.inProgress ? '#71d6c8' : '#2447c2'}" stroke="#faf8f3" stroke-width="3"><title>${sessionDate(point)} · ${point.deckName}: ${Math.round(point.rate * 100)}% (${point.correct}/${point.attempts})</title></circle>`).join('');
  const axisDate = point => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(point.endedAt || point.startedAt));
  const axis = points.length === 1 ? `<text x="${points[0].x}" y="${top + graphHeight + 22}" text-anchor="middle" fill="${chartColors.label}" font-size="9" font-family="DM Mono">${axisDate(points[0])}</text>` : `<text x="${points[0].x}" y="${top + graphHeight + 22}" text-anchor="start" fill="${chartColors.label}" font-size="9" font-family="DM Mono">${axisDate(points[0])}</text><text x="${points.at(-1).x}" y="${top + graphHeight + 22}" text-anchor="end" fill="${chartColors.label}" font-size="9" font-family="DM Mono">${axisDate(points.at(-1))}</text>`;
  elements.progressChart.innerHTML = `${grid}<polyline points="${pointString}" fill="none" stroke="${chartColors.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".4"/><polyline points="${pointString}" fill="none" stroke="${chartColors.point}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}${axis}`;
}

function heatmapDetails(day, item) {
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${day}T12:00:00`));
  const decks = Object.values(item?.decks || {}).filter(deck => deck.reviewed).map(deck => deck.name).join(', ') || 'No decks';
  return `${date} · ${item?.reviewed || 0} reviewed · ${item?.learned || 0} learned · ${decks}`;
}
function renderHeatmap() {
  const days = 112; const start = new Date(); start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - days + 1);
  const labels = []; const cells = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(start); date.setDate(start.getDate() + offset); const day = localDayKey(date); const item = state.activity[day]; const reviewed = item?.reviewed || 0;
    if (date.getDate() === 1 || offset === 0) labels.push(`<span style="grid-column:${Math.floor(offset / 7) + 1}">${new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date)}</span>`);
    const level = reviewed === 0 ? 0 : reviewed < 4 ? 1 : reviewed < 9 ? 2 : reviewed < 16 ? 3 : 4;
    cells.push(`<button class="heatmap-day level-${level}" type="button" data-heatmap-day="${day}" aria-label="${escapeHtml(heatmapDetails(day, item))}"></button>`);
  }
  elements.heatmapMonths.innerHTML = labels.join(''); elements.heatmapGrid.innerHTML = cells.join(''); elements.heatmapTip.textContent = 'Hover over a day for its study details.';
}

function formatSessionTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function renderAttempts() {
  const set = activeSet();
  const sessions = [...state.sessionHistory, ...(state.currentSession?.attempts ? [{ ...state.currentSession, inProgress: true }] : [])].filter(session => session.deckId === set?.id).reverse();
  elements.attemptsSubtitle.textContent = `Every attempt for ${set?.name || 'this deck'}`;
  elements.attemptsList.innerHTML = sessions.length ? sessions.map(session => {
    const accuracy = session.attempts ? Math.round((session.correct / session.attempts) * 100) : 0;
    return `<article class="attempt-entry"><div><strong>${session.inProgress ? 'Current session' : formatSessionTime(session.endedAt || session.startedAt)}</strong><span>${session.correct} correct · ${session.retry} missed · ${session.learned || 0} learned · ${session.attempts} answered</span><span>${escapeHtml(session.mode === 'typed' ? 'Typed answers' : 'Flip cards')} · ${escapeHtml(session.filter || 'all')} cards</span></div><b>${accuracy}%</b></article>`;
  }).join('') : '<p class="attempts-empty">Finish your first few cards to see attempts for this deck.</p>';
}

// Test Mode v2: richer, separately-persisted assessments. Existing v1 attempts are
// normalised on load so no saved results are lost.
function migrateTestHistory() { state.testHistory = state.testHistory.map(test => ({ ...test, version: test.version || 1, config: { deckIds: [], tags: [], filter: 'all', style: 'typed', promptSide: 'front', timed: false, timeLimitSeconds: 0, ...(test.config || {}) }, questions: Array.isArray(test.questions) ? test.questions : [], answers: Array.isArray(test.answers) ? test.answers : [], summary: test.summary || RecallTest.scoreTest(test) })); }
state.testReviewFilter = 'all'; state.testReviewSearch = ''; state.openTestResultId = null; state.testHistoryFilters = { deckId: '', folderId: '', days: '', score: '' };
function testSelectedDeckNames(test) { return [...new Set((test.questions || []).map(question => question.deckName).filter(Boolean))].join(', ') || 'Saved test'; }
function testResultById(id) { return state.testHistory.find(test => test.id === id) || state.testHistory.at(-1); }
function testTimerMarkup(test) { const remaining = RecallTest.remainingMs(test); const hasLimit = Number(test.config.timeLimitSeconds) > 0; const urgent = hasLimit && remaining <= 60000; return test.config.timed ? `<span class="test-timer ${urgent ? 'urgent' : ''}" id="testElapsed" data-test-deadline="${test.deadlineAt || ''}">${hasLimit ? testFormatDuration(remaining) : testFormatDuration(Date.now() - new Date(test.startedAt))}</span>` : `<span class="test-timer">${testFormatDuration(Date.now() - new Date(test.startedAt))} elapsed</span>`; }
function updateTestTimer() {
  const test = state.activeTest; const timer = $('#testElapsed'); if (!test || !timer) return;
  const remaining = RecallTest.remainingMs(test); const hasLimit = Number(test.config.timeLimitSeconds) > 0;
  if (hasLimit && remaining <= 0) { finishTest('time-expired'); return; }
  timer.textContent = hasLimit ? testFormatDuration(remaining) : testFormatDuration(Date.now() - new Date(test.startedAt));
  timer.classList.toggle('urgent', hasLimit && remaining <= 60000);
}
function openTestSetup() {
  clearInterval(testTimer); state.activeTest = null; state.testReviewFilter = 'all'; state.testReviewSearch = ''; testMode.hidden = false;
  testMode.innerHTML = `<div class="test-shell"><header class="test-head"><div><p class="eyebrow">Assessment</p><h1>Build a test.</h1><p>Tests are scored separately and never change your card learning states.</p></div><div class="test-head-actions"><button class="text-button" data-test-action="history" type="button">Test history</button><button class="drawer-close" data-test-action="close" type="button" aria-label="Close test mode">×</button></div></header><div class="test-setup-grid"><section class="test-panel"><h2>Choose material</h2><div class="test-choice-group"><h3>Decks</h3><div class="test-check-list">${testDeckChoices()}</div></div><div class="test-choice-group"><h3>Folders</h3><div class="test-check-list">${testFolderChoices()}</div></div><div class="test-choice-group"><h3>Tags <small>optional</small></h3><div class="test-tags">${testTagChoices()}</div></div></section><section class="test-panel"><h2>Test rules</h2><label class="test-field">Questions<input id="testQuestionCount" type="number" min="1" value="10" /></label><label class="test-field">Include cards<select id="testCardFilter"><option value="all">All cards</option><option value="new">New cards</option><option value="learning">Learning cards</option><option value="mastered">Mastered cards</option><option value="missed">Missed cards</option><option value="flagged">Flagged cards</option></select></label><label class="test-field">Answer style<select id="testAnswerStyle"><option value="typed">Typed answer only</option><option value="choice">Multiple choice only</option><option value="mixed">Mixed mode</option></select></label><label class="test-field">Show first<select id="testPromptSide"><option value="front">First side</option><option value="back">Second side</option></select></label><label class="test-toggle"><span><b>Timed countdown</b><small>Finish before the limit expires.</small></span><input id="testTimed" type="checkbox" checked /></label><label class="test-field test-limit-field">Time limit<select id="testTimeLimit"><option value="300">5 minutes</option><option value="600" selected>10 minutes</option><option value="900">15 minutes</option><option value="1200">20 minutes</option><option value="1800">30 minutes</option><option value="0">No limit — track elapsed</option></select></label><p class="test-pool-note" id="testPoolNote"></p><button class="primary-button test-start" data-test-action="start" type="button">Start test <span>→</span></button></section></div></div>`;
  refreshTestPoolNote();
}
function testSetupConfig() { const base = (() => { const deckIds = [...testMode.querySelectorAll('[data-test-deck]:checked')].map(input => input.value); const folderIds = [...testMode.querySelectorAll('[data-test-folder]:checked')].map(input => input.value); state.sets.filter(set => folderIds.includes(set.folderId)).forEach(set => deckIds.push(set.id)); return { deckIds: [...new Set(deckIds)], folderIds, tags: [...testMode.querySelectorAll('[data-test-tag]:checked')].map(input => input.value), count: Number($('#testQuestionCount')?.value) || 0, filter: $('#testCardFilter')?.value || 'all', style: $('#testAnswerStyle')?.value || 'typed', promptSide: $('#testPromptSide')?.value || 'front', timed: Boolean($('#testTimed')?.checked), timeLimitSeconds: Number($('#testTimeLimit')?.value) || 0 }; })(); return base; }
function startTest() {
  const config = testSetupConfig(); const pool = cardsForTest(config); const questions = RecallTest.selectQuestions(pool, config.count);
  if (!questions.length) { refreshTestPoolNote(); return showToast('Choose at least one matching card to start a test.'); }
  if (config.style !== 'typed' && questions.some(question => RecallTest.choicesFor(question, testChoicePool(question), config.promptSide).length < 4)) return showToast('Multiple choice needs four distinct answers. Add more cards or use typed answers.');
  const now = Date.now(); state.activeTest = { id: makeId(), version: 2, config, pool, questions: questions.map(card => ({ ...card, answerType: config.style === 'mixed' ? (Math.random() < .5 ? 'typed' : 'choice') : config.style, choices: null })), answers: [], currentIndex: 0, startedAt: new Date(now).toISOString(), deadlineAt: config.timed && config.timeLimitSeconds ? new Date(now + config.timeLimitSeconds * 1000).toISOString() : null, questionStartedAt: now, feedback: null };
  renderTestQuestion();
}
function renderTestQuestion() {
  const test = state.activeTest; const question = activeTestQuestion(); if (!test || !question) return finishTest();
  const promptName = test.config.promptSide === 'front' ? question.frontLabel : question.backLabel; const answerName = test.config.promptSide === 'front' ? question.backLabel : question.frontLabel;
  if (question.answerType === 'choice' && !question.choices) question.choices = RecallTest.choicesFor(question, testChoicePool(question), test.config.promptSide);
  const feedback = test.feedback; const answered = Boolean(feedback); const input = question.answerType === 'typed' ? `<form class="test-answer-form" id="testTypedForm"><label>Type your answer<input id="testTypedInput" autocomplete="off" autofocus ${answered ? 'disabled' : ''}/></label><button class="primary-button" type="submit" ${answered ? 'disabled' : ''}>Submit <kbd>Enter</kbd></button></form>` : `<div class="test-choices">${question.choices.map((choice, index) => `<button class="test-choice ${answered ? (RecallTest.answersMatch(choice, testAnswerValue(question)) ? 'correct' : feedback.userAnswer === choice ? 'incorrect' : '') : ''}" data-test-choice="${index}" type="button" ${answered ? 'disabled' : ''}><kbd>${index + 1}</kbd><span>${escapeHtml(choice)}</span></button>`).join('')}</div>`;
  const progress = Math.round((test.currentIndex / test.questions.length) * 100);
  testMode.innerHTML = `<div class="test-shell test-running"><header class="test-head"><div><p class="eyebrow">${escapeHtml(question.deckName)}</p><h1>Question ${test.currentIndex + 1} <em>of ${test.questions.length}</em></h1><div class="test-progress" aria-label="Question progress"><span style="width:${progress}%"></span></div></div><div class="test-running-actions">${testTimerMarkup(test)}<button class="text-button" data-test-action="exit" type="button">Exit test <kbd>Esc</kbd></button></div></header><main class="test-question"><div class="test-question-meta"><span>${escapeHtml(promptName)} · PROMPT</span><span class="card-state ${question.state.toLowerCase()}">${question.state}</span></div><article class="test-card"><p>${escapeHtml(testPromptValue(question))}</p></article><p class="test-answer-label">Answer in <b>${escapeHtml(answerName)}</b></p>${input}${answered ? `<section class="test-feedback ${feedback.result}"><strong>${feedback.result === 'correct' ? 'Correct' : 'Not quite'}</strong><span>Expected answer: <b>${escapeHtml(testAnswerValue(question))}</b></span></section>` : ''}<div class="test-question-footer"><button class="text-button" data-test-action="skip" type="button" ${answered ? 'disabled' : ''}>Skip question</button>${answered ? `<button class="primary-button" data-test-action="next" type="button">${test.currentIndex === test.questions.length - 1 ? 'See results' : 'Next question'} <span>→</span></button>` : ''}</div></main></div>`;
  clearInterval(testTimer); testTimer = setInterval(updateTestTimer, 250); $('#testTypedForm')?.addEventListener('submit', event => { event.preventDefault(); submitTestAnswer($('#testTypedInput').value); }); updateTestTimer();
}
function finishTest(reason = 'complete') { const test = state.activeTest; if (!test || test.finishedAt) return; clearInterval(testTimer); test.endedAt = new Date().toISOString(); test.finishReason = reason; test.summary = RecallTest.scoreTest(test); test.finishedAt = test.endedAt; state.testHistory.push({ ...test }); state.openTestResultId = test.id; state.activeTest = null; save(); renderTestResults(test); }
function testReviewRows(test) { const items = RecallTest.reviewItems(test); const filter = state.testReviewFilter; const search = state.testReviewSearch.trim().toLocaleLowerCase(); return items.filter(item => (filter === 'all' || item.result === filter) && (!search || [item.prompt, item.userAnswer, item.correctAnswer, item.deckName, ...(item.tags || [])].join(' ').toLocaleLowerCase().includes(search))); }
function testResultStatus(item) { return item.result === 'correct' ? 'Correct' : item.result === 'incorrect' ? 'Incorrect' : item.result === 'skipped' ? 'Skipped' : 'Unanswered'; }
function renderTestResults(test) {
  state.openTestResultId = test.id; const summary = test.summary || RecallTest.scoreTest(test); const items = testReviewRows(test); const misses = RecallTest.missedQuestions({ ...test, answers: RecallTest.reviewItems(test) });
  testMode.innerHTML = `<div class="test-shell test-results"><header class="test-head"><div><p class="eyebrow">${test.finishReason === 'time-expired' ? 'Time expired' : 'Test complete'}</p><h1>${summary.percentage}% <em>accuracy</em></h1><p>${summary.correct} correct · ${summary.incorrect} incorrect · ${summary.skipped} skipped · ${summary.unanswered} unanswered</p></div><div class="test-head-actions"><button class="text-button" data-test-action="history" type="button">Test history</button><button class="drawer-close" data-test-action="close" type="button" aria-label="Close results">×</button></div></header><section class="test-score-grid"><div><b>${testFormatDuration(summary.elapsedMs)}</b><span>time taken</span></div><div><b>${testFormatDuration(summary.averageMs)}</b><span>average per question</span></div><div><b>${summary.correct}/${summary.total}</b><span>final score</span></div></section><div class="test-results-grid"><section class="test-panel"><h2>Accuracy by deck</h2><ul class="test-breakdown">${testAccuracyBreakdown(RecallTest.reviewItems(test), 'deck')}</ul><h2>Accuracy by tag</h2><ul class="test-breakdown">${testAccuracyBreakdown(RecallTest.reviewItems(test), 'tag')}</ul></section><section class="test-panel test-full-review"><div class="test-review-head"><h2>Review every question</h2><input id="testReviewSearch" type="search" value="${escapeHtml(state.testReviewSearch)}" placeholder="Search question or answer" /></div><div class="test-review-filters">${['all', 'incorrect', 'skipped', 'unanswered', 'correct'].map(filter => `<button data-test-review-filter="${filter}" type="button" class="${state.testReviewFilter === filter ? 'active' : ''}">${filter === 'all' ? 'All' : filter[0].toUpperCase() + filter.slice(1)}</button>`).join('')}</div><div class="test-missed-list test-review-list">${items.length ? items.map(item => `<article class="test-review-item ${item.result}"><span>${testResultStatus(item)} · ${escapeHtml(item.deckName)} · ${escapeHtml(item.answerType === 'choice' ? 'Multiple choice' : 'Typed')} · ${item.timeMs === null ? '—' : testFormatDuration(item.timeMs)}</span><strong>${escapeHtml(item.prompt)}</strong><p>Your answer: ${escapeHtml(item.userAnswer)}<br/>Expected answer: <b>${escapeHtml(item.correctAnswer)}</b>${item.tags?.length ? `<br/><i>${escapeHtml(item.tags.join(', '))}</i>` : ''}</p></article>`).join('') : '<p class="test-muted">No questions match this filter.</p>'}</div></section></div><footer class="test-results-actions"><button class="text-button" data-test-action="study-missed" type="button" ${misses.length ? '' : 'disabled'}>Study missed cards</button><button class="text-button" data-test-action="retry-all" type="button">Retry all</button><button class="primary-button" data-test-action="retry-missed" type="button" ${misses.length ? '' : 'disabled'}>Retry missed <span>→</span></button><button class="text-button" data-test-action="close" type="button">Return to library</button></footer></div>`;
}
function startRetryTest(source, mode) { const questions = RecallTest.retryQuestions(source, mode); if (!questions.length) return showToast('There are no questions to retry.'); const now = Date.now(); state.activeTest = { id: makeId(), version: 2, config: { ...source.config, count: questions.length }, pool: source.pool || questions, questions: questions.map(question => ({ ...question, choices: null })), answers: [], currentIndex: 0, startedAt: new Date(now).toISOString(), deadlineAt: source.config.timed && source.config.timeLimitSeconds ? new Date(now + source.config.timeLimitSeconds * 1000).toISOString() : null, questionStartedAt: now, feedback: null }; renderTestQuestion(); }
function retryMissedTest() { const source = testResultById(state.openTestResultId); if (source) startRetryTest(source, 'missed'); }
function retryAllTest() { const source = testResultById(state.openTestResultId); if (source) startRetryTest(source, 'all'); }
function studySetForCard(card) { return state.testStudyContext?.get(card.id) || state.sets.find(set => set.cards.includes(card) || set.cards.some(item => item.id === card.id)) || activeSet(); }
function studyMissedTest() { const source = testResultById(state.openTestResultId); const retry = source ? RecallTest.retryQuestions(source, 'missed') : []; const cards = retry.map(question => state.sets.find(set => set.id === question.deckId)?.cards.find(card => card.id === question.id)).filter(Boolean); if (!cards.length) return; state.testStudyContext = new Map(cards.map(card => [card.id, state.sets.find(set => set.cards.includes(card))])); state.activeSetId = studySetForCard(cards[0]).id; state.queue = shuffledCopy(cards); state.currentIndex = 0; state.correct = 0; state.retry = 0; state.history = []; state.flipped = false; state.typedChecked = false; startNewSession(); testMode.hidden = true; render(); document.querySelector('#study').scrollIntoView({ behavior: 'smooth' }); showToast(`Normal study started with ${cards.length} missed card${cards.length === 1 ? '' : 's'} across ${new Set(retry.map(question => question.deckName)).size} deck${new Set(retry.map(question => question.deckName)).size === 1 ? '' : 's'}.`); }
function renderTestHistory() {
  const filters = state.testHistoryFilters; const attempts = RecallTest.filterHistory(state.testHistory, filters).sort((a, b) => new Date(b.endedAt || b.startedAt) - new Date(a.endedAt || a.startedAt));
  const deckOptions = state.sets.map(set => `<option value="${set.id}" ${filters.deckId === set.id ? 'selected' : ''}>${escapeHtml(set.name)}</option>`).join(''); const folderOptions = state.folders.map(folder => `<option value="${folder.id}" ${filters.folderId === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('');
  testMode.hidden = false; testMode.innerHTML = `<div class="test-shell test-history"><header class="test-head"><div><p class="eyebrow">Assessment</p><h1>Test history.</h1><p>Completed tests stay separate from your normal study sessions.</p></div><div class="test-head-actions"><button class="primary-button" data-test-action="new-test" type="button">New test</button><button class="drawer-close" data-test-action="close" type="button" aria-label="Close history">×</button></div></header><section class="test-history-tools"><label>Deck<select data-test-history-filter="deckId"><option value="">All decks</option>${deckOptions}</select></label><label>Folder<select data-test-history-filter="folderId"><option value="">All folders</option>${folderOptions}</select></label><label>Date<select data-test-history-filter="days"><option value="">Any time</option><option value="1" ${filters.days === '1' ? 'selected' : ''}>Today</option><option value="7" ${filters.days === '7' ? 'selected' : ''}>Last 7 days</option><option value="30" ${filters.days === '30' ? 'selected' : ''}>Last 30 days</option></select></label><label>Score<select data-test-history-filter="score"><option value="">Any score</option><option value="perfect" ${filters.score === 'perfect' ? 'selected' : ''}>Perfect</option><option value="80plus" ${filters.score === '80plus' ? 'selected' : ''}>80% or higher</option><option value="below80" ${filters.score === 'below80' ? 'selected' : ''}>Below 80%</option></select></label></section><div class="test-history-list">${attempts.length ? attempts.map(test => { const summary = test.summary || RecallTest.scoreTest(test); return `<article><button class="test-history-open" data-test-action="open-saved" data-test-id="${test.id}" type="button"><span>${formatSessionTime(test.endedAt || test.startedAt)}</span><strong>${escapeHtml(testSelectedDeckNames(test))}</strong><small>${summary.total} questions · ${test.config?.style === 'choice' ? 'Multiple choice' : test.config?.style === 'mixed' ? 'Mixed' : 'Typed'} · ${testFormatDuration(summary.elapsedMs)}</small><b>${summary.percentage}%</b></button><button class="delete-card" data-test-action="delete-test" data-test-id="${test.id}" type="button" aria-label="Delete this test">×</button></article>`; }).join('') : '<p class="test-muted">No completed tests match these filters.</p>'}</div></div>`;
}
function deleteTestAttempt(id) { const test = state.testHistory.find(item => item.id === id); if (!test || !confirm(`Delete this saved test from ${formatSessionTime(test.endedAt || test.startedAt)}?`)) return; state.testHistory = state.testHistory.filter(item => item.id !== id); save(); renderTestHistory(); }
function closeTestMode() { if (state.activeTest && !confirm('Exit this test? Your unfinished answers will be lost.')) return; clearInterval(testTimer); state.activeTest = null; testMode.hidden = true; }
queueMicrotask(() => {
testMode.addEventListener('click', event => { const action = event.target.closest('[data-test-action]')?.dataset.testAction; if (action === 'history') renderTestHistory(); if (action === 'new-test') openTestSetup(); if (action === 'open-saved') { const test = testResultById(event.target.closest('[data-test-id]').dataset.testId); if (test) renderTestResults(test); } if (action === 'delete-test') deleteTestAttempt(event.target.closest('[data-test-id]').dataset.testId); if (action === 'retry-all') retryAllTest(); });
testMode.addEventListener('change', event => { const field = event.target.dataset.testHistoryFilter; if (field) { state.testHistoryFilters[field] = event.target.value; renderTestHistory(); } });
testMode.addEventListener('input', event => { if (event.target.id === 'testReviewSearch') { state.testReviewSearch = event.target.value; const test = testResultById(state.openTestResultId); if (test) renderTestResults(test); } });
testMode.addEventListener('click', event => { const filter = event.target.dataset.testReviewFilter; if (filter) { state.testReviewFilter = filter; const test = testResultById(state.openTestResultId); if (test) renderTestResults(test); } });
document.addEventListener('keydown', event => { const test = state.activeTest; if (!test) return; const key = event.key; if (key === 'Escape') { event.preventDefault(); if (confirm('Exit this test? Your unfinished answers will be lost.')) { clearInterval(testTimer); state.activeTest = null; testMode.hidden = true; } return; } if (key === 'Enter') { if (test.feedback) { event.preventDefault(); nextTestQuestion(); } return; } if (activeTestQuestion()?.answerType === 'choice' && /^[1-4]$/.test(key) && !test.feedback) { event.preventDefault(); const choice = activeTestQuestion().choices?.[Number(key) - 1]; if (choice) submitTestAnswer(choice); } });
window.addEventListener('beforeunload', event => { if (state.activeTest) { event.preventDefault(); event.returnValue = ''; } });
});

function libraryComparator(mode = elements.librarySort.value) {
  return (left, right) => {
    if (mode === 'name-asc') return left.name.localeCompare(right.name);
    if (mode === 'name-desc') return right.name.localeCompare(left.name);
    if (mode === 'cards-desc') return right.cards.length - left.cards.length || left.name.localeCompare(right.name);
    if (mode === 'cards-asc') return left.cards.length - right.cards.length || left.name.localeCompare(right.name);
    if (mode === 'subject') { const leftSubject = resolvedDeckSubject(left).subject || 'zzzz'; const rightSubject = resolvedDeckSubject(right).subject || 'zzzz'; return leftSubject.localeCompare(rightSubject) || left.name.localeCompare(right.name); }
    return left.order - right.order;
  };
}

function reindex(items) { items.forEach((item, index) => { item.order = index; }); }

function libraryGroups(filter, mode) {
  const query = filter.trim().toLocaleLowerCase(); const folders = [...state.folders].sort((a, b) => {
    if (mode === 'name-asc') return a.name.localeCompare(b.name);
    if (mode === 'name-desc') return b.name.localeCompare(a.name);
    return a.order - b.order;
  }); const folderById = new Map(folders.map(folder => [folder.id, folder]));
  const visible = (set, folder) => !query || set.name.toLocaleLowerCase().includes(query) || folder?.name.toLocaleLowerCase().includes(query);
  const sortSets = sets => [...sets].filter(set => visible(set, folderById.get(set.folderId))).sort(libraryComparator(mode));
  const groups = [];
  const ungrouped = sortSets(state.sets.filter(set => !set.folderId || !folderById.has(set.folderId)));
  if (ungrouped.length) groups.push({ folder: null, sets: ungrouped, ungrouped: true });
  folders.forEach(folder => { const sets = sortSets(state.sets.filter(set => set.folderId === folder.id)); if (sets.length || !query || folder.name.toLocaleLowerCase().includes(query)) groups.push({ folder, sets, ungrouped: false }); });
  return groups;
}

function folderControls(folder, manual) {
  if (!folder) return '';
  return `<div class="folder-actions"><input class="folder-colour" data-folder-color="${folder.id}" type="color" value="${folder.color}" title="Change folder colour"/><button class="library-icon-button" data-rename-folder="${folder.id}" type="button" title="Rename folder">✎</button>${manual ? `<button class="library-icon-button" data-move-folder="${folder.id}" data-direction="up" type="button" title="Move folder up">↑</button><button class="library-icon-button" data-move-folder="${folder.id}" data-direction="down" type="button" title="Move folder down">↓</button>` : ''}<button class="library-icon-button library-delete-button" data-delete-folder="${folder.id}" type="button" title="Delete folder">×</button></div>`;
}

function setActions(set, manual) { return `<div class="library-item-actions"><button class="library-icon-button" data-rename-set="${set.id}" type="button" title="Rename set">✎</button>${manual ? `<button class="library-icon-button" data-move-set="${set.id}" data-direction="up" type="button" title="Move set up">↑</button><button class="library-icon-button" data-move-set="${set.id}" data-direction="down" type="button" title="Move set down">↓</button>` : ''}<button class="library-icon-button library-delete-button" data-delete-set="${set.id}" type="button" title="Delete set">×</button></div>`; }

function renderLibrary() {
  const filter = elements.librarySearch.value; const mode = elements.librarySort.value; const manual = mode === 'manual';
  elements.libraryTree.innerHTML = '';
  libraryGroups(filter, mode).forEach(({ folder, sets, ungrouped }) => {
    const group = document.createElement('section'); group.className = `library-folder ${ungrouped ? 'ungrouped-folder' : ''}`; group.dataset.dropFolder = folder?.id || '';
    const color = folder?.color || '#a0a6b4'; const title = ungrouped ? 'Ungrouped sets' : folder.name; const collapsed = Boolean(folder?.collapsed);
    group.innerHTML = `<div class="library-folder-head" style="--folder-colour:${color}"><button class="folder-toggle" data-toggle-folder="${folder?.id || ''}" type="button" ${ungrouped ? 'disabled' : ''}><span class="folder-symbol">●</span><span>${escapeHtml(title)}</span><i>${collapsed ? '›' : '⌄'}</i></button>${folderControls(folder, manual)}</div>`;
    if (!collapsed) sets.forEach(set => { const row = document.createElement('div'); row.className = 'library-set-row'; row.draggable = true; row.dataset.dragSet = set.id; row.innerHTML = `<button class="set-entry ${set.id === state.activeSetId ? 'active' : ''}" data-set="${set.id}" type="button"><span>${escapeHtml(set.name)}</span><small>${set.cards.length} ${set.cards.length === 1 ? 'card' : 'cards'}</small></button>${setActions(set, manual)}`; group.append(row); });
    elements.libraryTree.append(group);
  });
  if (!elements.libraryTree.children.length) elements.libraryTree.innerHTML = '<p class="library-empty">No sets or folders match that filter.</p>';
  if (!elements.fullLibrary.hidden) renderFullLibrary();
}

function renderFullLibrary() {
  const filter = elements.fullLibrarySearch.value; const mode = elements.fullLibrarySort.value; const manual = mode === 'manual';
  elements.fullLibraryGrid.innerHTML = '';
  libraryGroups(filter, mode).forEach(({ folder, sets, ungrouped }) => {
    const group = document.createElement('section'); group.className = `full-folder-group ${ungrouped ? 'ungrouped-folder' : ''}`; group.dataset.dropFolder = folder?.id || '';
    const color = folder?.color || '#a0a6b4'; const title = ungrouped ? 'Ungrouped sets' : folder.name; const collapsed = Boolean(folder?.collapsed);
    group.innerHTML = `<div class="full-folder-head" style="--folder-colour:${color}"><button class="folder-toggle" data-toggle-folder="${folder?.id || ''}" type="button" ${ungrouped ? 'disabled' : ''}><span>●</span>${escapeHtml(title)} <i>${collapsed ? '›' : '⌄'}</i></button>${folderControls(folder, manual)}</div>`;
    if (!collapsed) { const grid = document.createElement('div'); grid.className = 'deck-grid'; sets.forEach(set => { const card = document.createElement('article'); card.className = `deck-grid-card ${set.id === state.activeSetId ? 'active' : ''}`; card.draggable = true; card.dataset.dragSet = set.id; card.innerHTML = `<button data-set="${set.id}" type="button"><span>${escapeHtml(set.name)}</span><small>${set.cards.length} ${set.cards.length === 1 ? 'card' : 'cards'}</small></button>${setActions(set, manual)}`; grid.append(card); }); group.append(grid); }
    elements.fullLibraryGrid.append(group);
  });
  if (!elements.fullLibraryGrid.children.length) elements.fullLibraryGrid.innerHTML = '<p class="library-empty">No sets or folders match that filter.</p>';
}

function flip() {
  if (!currentCard() || state.animating) return;
  state.flipped = !state.flipped; elements.card.classList.remove('flipping'); void elements.card.offsetWidth; elements.card.classList.add('flipping'); render();
}

function localDayKey(value = new Date()) { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function previousDayKey(value) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() - 1); return localDayKey(date); }
function studyStreaks() {
  const activeDays = new Set(Object.entries(state.activity).filter(([, item]) => item.reviewed > 0).map(([day]) => day));
  let current = 0; let cursor = localDayKey(); if (!activeDays.has(cursor)) cursor = previousDayKey(cursor); while (activeDays.has(cursor)) { current += 1; cursor = previousDayKey(cursor); }
  const sorted = [...activeDays].sort(); let longest = 0; let run = 0; let previous = null;
  sorted.forEach(day => { run = previous && previousDayKey(day) === previous ? run + 1 : 1; longest = Math.max(longest, run); previous = day; });
  return { current, longest };
}
function applyCardReview(card, result) {
  const before = { state: card.state, missed: card.missed, correctStreak: card.correctStreak, reviewCount: card.reviewCount };
  card.reviewCount += 1; let learned = false;
  if (result === 'correct') {
    if (card.state === 'New') card.state = 'Learning';
    card.correctStreak += 1; card.missed = false;
    if (card.state === 'Learning' && card.correctStreak >= 2) { card.state = 'Mastered'; learned = before.state !== 'Mastered'; }
  } else { card.state = 'Learning'; card.correctStreak = 0; card.missed = true; }
  return { before, learned };
}
function recordActivity(card, learned) {
  const day = localDayKey(); const entry = state.activity[day] ||= { reviewed: 0, learned: 0, decks: {} }; const deck = studySetForCard(card);
  entry.reviewed += 1; entry.learned += learned ? 1 : 0;
  const deckEntry = entry.decks[deck.id] ||= { name: deck.name, reviewed: 0, learned: 0 }; deckEntry.name = deck.name; deckEntry.reviewed += 1; deckEntry.learned += learned ? 1 : 0;
  return { day, deckId: deck.id, learned };
}
function undoActivity(activity) {
  if (!activity) return; const entry = state.activity[activity.day]; if (!entry) return;
  entry.reviewed = Math.max(0, entry.reviewed - 1); entry.learned = Math.max(0, entry.learned - (activity.learned ? 1 : 0)); const deck = entry.decks[activity.deckId];
  if (deck) { deck.reviewed = Math.max(0, deck.reviewed - 1); deck.learned = Math.max(0, deck.learned - (activity.learned ? 1 : 0)); if (!deck.reviewed) delete entry.decks[activity.deckId]; }
  if (!entry.reviewed) delete state.activity[activity.day];
}
function normaliseAnswer(value) { return String(value).replace(/\([^)]*\)/g, ' ').toLocaleLowerCase().trim().replace(/[\p{P}\p{S}_]+/gu, ' ').replace(/\s+/g, ' ').trim(); }
function answersMatch(actual, expected) { return normaliseAnswer(actual) === normaliseAnswer(expected); }

function review(result) {
  if (!currentCard() || state.animating) return;
  const answeredCard = currentCard();
  const schedulingBefore = { dueAt: answeredCard.dueAt, lastReviewedAt: answeredCard.lastReviewedAt, repetitions: answeredCard.repetitions, lapses: answeredCard.lapses, schedulerVersion: answeredCard.schedulerVersion };
  const reviewedAt = new Date();
  const responseTimeMs = Math.max(0, reviewedAt.getTime() - (state.cardPresentedAt || reviewedAt.getTime()));
  RecallScheduler.scheduleCard(answeredCard, result, reviewedAt);
  const reviewEvent = RecallScheduler.createReviewEvent(answeredCard, result, reviewedAt, responseTimeMs, activeSet()?.id);
  state.reviewLog.push(reviewEvent);
  state.animating = true; elements.card.classList.remove('slide-left', 'slide-right'); void elements.card.offsetWidth; elements.card.classList.add(result === 'correct' ? 'slide-right' : 'slide-left');
  setTimeout(() => {
    let repeatIndex = null;
    if (result === 'retry' && state.repeatMissed && !state.sessionRepeatedIds.has(answeredCard.id)) { repeatIndex = state.queue.length; state.queue.push(answeredCard); state.sessionRepeatedIds.add(answeredCard.id); }
    const transition = applyCardReview(answeredCard, result); const activity = recordActivity(answeredCard, transition.learned);
    state.history.push({ result, repeatIndex, cardId: answeredCard.id, cardBefore: transition.before, schedulingBefore, activity, reviewLogId: reviewEvent.id });
    if (!state.currentSession) startNewSession();
    state.currentSession.attempts += 1;
    if (result === 'correct') state.currentSession.correct += 1; else state.currentSession.retry += 1;
    if (transition.learned) state.currentSession.learned += 1;
    if (result === 'correct') state.correct++; else state.retry++; state.currentIndex++; state.cardPresentedAt = Date.now(); state.flipped = false; state.typedChecked = false; state.hintRevealed = false; elements.typedInput.value = ''; state.animating = false; save(); render();
  }, 250);
}

function undoReview() {
  if (!state.history.length || state.animating) return;
  const last = state.history.pop();
  state.currentIndex = Math.max(0, state.currentIndex - 1);
  if (last.repeatIndex !== null) { state.queue.splice(last.repeatIndex, 1); state.sessionRepeatedIds.delete(last.cardId); }
  if (last.result === 'correct') state.correct = Math.max(0, state.correct - 1); else state.retry = Math.max(0, state.retry - 1);
  if (state.currentSession) { state.currentSession.attempts = Math.max(0, state.currentSession.attempts - 1); if (last.result === 'correct') state.currentSession.correct = Math.max(0, state.currentSession.correct - 1); else state.currentSession.retry = Math.max(0, state.currentSession.retry - 1); }
  const card = state.sets.flatMap(set => set.cards).find(item => item.id === last.cardId); if (card && last.cardBefore) Object.assign(card, last.cardBefore); if (card && last.schedulingBefore) Object.assign(card, last.schedulingBefore); if (last.reviewLogId) state.reviewLog = state.reviewLog.filter(event => event.id !== last.reviewLogId); undoActivity(last.activity); if (last.activity?.learned && state.currentSession) state.currentSession.learned = Math.max(0, state.currentSession.learned - 1);
  state.flipped = false; state.typedChecked = false; state.hintRevealed = false; state.cardPresentedAt = Date.now(); save(); render(); showToast('Last answer undone.');
}

async function enterFocus() {
  document.body.classList.add('focus-study');
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch { /* the app still provides its distraction-free layout */ }
}

async function exitFocus() {
  document.body.classList.remove('focus-study');
  if (document.fullscreenElement) await document.exitFullscreen();
}

function cardKey(card) { return normaliseAnswer(card.front) + '\u0000' + normaliseAnswer(card.back); }
function findDuplicate(card, cards = activeCards()) { const key = cardKey(card); return cards.find(item => cardKey(item) === key); }
function addCards(cards, duplicateMode = 'keep', destination = activeSet()) {
  const set = destination; if (!set) return 0;
  let added = 0; cards.map(card => normaliseCard({ ...card, tags: cleanTags([...(set.tags || []), ...(card.tags || [])]), front: String(card.front || '').trim(), back: String(card.back || '').trim(), id: makeId() })).filter(card => card.front && card.back).forEach(card => {
    const existing = findDuplicate(card, set.cards);
    if (existing && duplicateMode === 'skip') return;
    if (existing && duplicateMode === 'replace') { Object.assign(existing, { ...card, id: existing.id, flagged: existing.flagged, state: existing.state, missed: existing.missed, correctStreak: existing.correctStreak, reviewCount: existing.reviewCount }); added += 1; return; }
    set.cards.push(card); added += 1;
  });
  if (!added) return 0; save(); if (set.id === activeSet()?.id) buildQueue(); else render(); return added;
}

function separatorFor(line, format) {
  const presets = { tab: /\t+/, dash: /\s[—–]\s/, hyphen: /\s-\s/, colon: /:\s+/, pipe: /\s\|\s/, arrow: /\s→\s/ };
  const patterns = format === 'auto' ? [presets.tab, presets.arrow, presets.dash, presets.hyphen, presets.pipe, /\s*;\s*/, presets.colon] : [presets[format]];
  for (const pattern of patterns) {
    if (!pattern) continue;
    const matches = [...line.matchAll(new RegExp(pattern.source, 'g'))];
    if (matches.length) { const match = matches[matches.length - 1]; return { at: match.index, length: match[0].length }; }
  }
  return null;
}

function parseList(text, format) {
  const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim());
  if (format === 'lines') { const content = lines.filter(Boolean); return Array.from({ length: Math.floor(content.length / 2) }, (_, i) => ({ front: content[i * 2], back: content[i * 2 + 1] })); }
  const cards = []; let open = null;
  for (const line of lines) {
    if (!line) continue;
    const separator = separatorFor(line, format);
    if (separator) { if (open) cards.push(open); open = { front: line.slice(0, separator.at).trim(), back: line.slice(separator.at + separator.length).trim() }; }
    else if (open) open.back = `${open.back} ${line}`.trim();
  }
  if (open) cards.push(open); return cards.filter(card => card.front && card.back);
}

const EXPORT_COLUMNS = ['first_side', 'second_side', 'tags', 'notes', 'hint', 'flagged', 'state', 'missed', 'correct_streak', 'review_count'];
function parseDelimited(text, delimiter) {
  const rows = []; let row = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) { const char = text[index]; const next = text[index + 1]; if (char === '"' && quoted && next === '"') { value += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === delimiter && !quoted) { row.push(value); value = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') index += 1; row.push(value); if (row.some(cell => cell.trim())) rows.push(row); row = []; value = ''; } else value += char; }
  row.push(value); if (row.some(cell => cell.trim())) rows.push(row); return rows;
}
function rowsToImportDraft(rows) {
  const headers = rows[0]?.map((value, index) => String(value || '').trim() || `Column ${index + 1}`) || []; const data = rows.slice(1).map((cells, index) => ({ id: makeId(), cells, include: true, sourceRow: index + 2 }));
  return { kind: 'cards', headers, rows: data, defaults: { front: 0, back: 1, tags: headers.findIndex(header => /tag/i.test(header)), notes: headers.findIndex(header => /note/i.test(header)), hint: headers.findIndex(header => /hint/i.test(header)) } };
}
function openImportPreview(cards, headers = ['First side', 'Second side']) {
  const rows = cards.map((card, index) => ({ id: makeId(), cells: [card.front || '', card.back || '', (card.tags || []).join(', '), card.notes || '', card.hint || ''], include: true, sourceRow: index + 1 }));
  state.importDraft = { kind: 'cards', headers: headers.length >= 5 ? headers : ['First side', 'Second side', 'Tags', 'Notes', 'Hint'], rows, defaults: { front: 0, back: 1, tags: 2, notes: 3, hint: 4 } }; renderImportPreview(); elements.importPreview.hidden = false;
}
function openSharePreview(payload) {
  const rows = (payload.sets || []).flatMap(set => (set.cards || []).map((card, index) => ({ id: makeId(), cells: [card.front || '', card.back || '', (card.tags || []).join(', '), card.notes || '', card.hint || ''], include: true, sourceRow: `${set.name} · ${index + 1}`, sourceSet: set.name, sourceFolderId: set.folderId, original: card })));
  state.importDraft = { kind: 'share', headers: ['First side', 'Second side', 'Tags', 'Notes', 'Hint'], rows, folders: payload.folders || [], sets: payload.sets || [], defaults: { front: 0, back: 1, tags: 2, notes: 3, hint: 4 } }; renderImportPreview(); elements.importPreview.hidden = false;
}
function mappingOptions(selected) { return `<option value="-1">Do not import</option>${state.importDraft.headers.map((header, index) => `<option value="${index}" ${index === selected ? 'selected' : ''}>${escapeHtml(header)}</option>`).join('')}`; }
function mappedCard(row) { const read = key => { const index = Number(state.importDraft.defaults[key]); return index >= 0 ? String(row.cells[index] || '') : ''; }; return { front: read('front'), back: read('back'), tags: cleanTags(read('tags')), notes: read('notes'), hint: read('hint') }; }
function renderImportPreview() {
  const draft = state.importDraft; if (!draft) return;
  elements.shareImportModeWrap.hidden = draft.kind !== 'share';
  elements.mapFront.innerHTML = mappingOptions(draft.defaults.front); elements.mapBack.innerHTML = mappingOptions(draft.defaults.back); elements.mapTags.innerHTML = mappingOptions(draft.defaults.tags); elements.mapNotes.innerHTML = mappingOptions(draft.defaults.notes); elements.mapHint.innerHTML = mappingOptions(draft.defaults.hint);
  elements.importDestination.innerHTML = `<option value="active">${escapeHtml(activeSet()?.name || 'Current deck')}</option><option value="new">Create a new deck</option>${state.sets.map(set => `<option value="${set.id}">${escapeHtml(set.name)}</option>`).join('')}`;
  const valid = draft.rows.filter(row => row.include && mappedCard(row).front && mappedCard(row).back); const duplicates = valid.filter(row => findDuplicate(mappedCard(row))).length;
  elements.importPreviewSummary.textContent = `${valid.length} valid card${valid.length === 1 ? '' : 's'} ready · ${duplicates} duplicate warning${duplicates === 1 ? '' : 's'}${draft.kind === 'share' ? ` · ${draft.sets.length} shared deck${draft.sets.length === 1 ? '' : 's'}` : ''}. Imported cards include sides, tags, notes, hints, and learning data when mapped.`;
  elements.importPreviewRows.innerHTML = draft.rows.map(row => { const card = mappedCard(row); const invalid = !card.front || !card.back; const duplicate = !invalid && findDuplicate(card); return `<article class="import-preview-row ${!row.include ? 'excluded' : ''} ${invalid ? 'invalid' : ''}"><label><input type="checkbox" data-import-include="${row.id}" ${row.include ? 'checked' : ''}/> Include</label><span>Row ${row.sourceRow}</span><input data-import-edit="front" data-import-row="${row.id}" value="${escapeHtml(card.front)}" placeholder="First side"/><input data-import-edit="back" data-import-row="${row.id}" value="${escapeHtml(card.back)}" placeholder="Second side"/><small>${invalid ? 'Missing a side' : duplicate ? 'Duplicate in destination' : 'Ready'}</small></article>`; }).join('');
}
function closeImportPreview() { elements.importPreview.hidden = true; state.importDraft = null; }
function csvEscape(value, delimiter) { const text = String(value ?? ''); return text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function deckToDelimited(set, delimiter) { return [EXPORT_COLUMNS, ...set.cards.map(card => [card.front, card.back, card.tags.join(', '), card.notes, card.hint, card.flagged, card.state, card.missed, card.correctStreak, card.reviewCount])].map(row => row.map(value => csvEscape(value, delimiter)).join(delimiter)).join('\r\n'); }
function downloadLocalFile(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function exportDeck(delimiter) { const set = activeSet(); if (!set) return; const ext = delimiter === '\t' ? 'tsv' : 'csv'; downloadLocalFile(`${set.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'deck'}.${ext}`, deckToDelimited(set, delimiter), delimiter === '\t' ? 'text/tab-separated-values' : 'text/csv'); showToast(`${set.name} exported as ${ext.toUpperCase()}.`); }
function exportShare() { const ids = [...elements.shareDeckOptions.querySelectorAll('input:checked')].map(input => input.value); const sets = state.sets.filter(set => ids.includes(set.id)); if (!sets.length) return showToast('Choose at least one deck to share.'); const folderIds = new Set(sets.map(set => set.folderId).filter(Boolean)); const payload = { format: 'recall-share-v1', exportedAt: new Date().toISOString(), folders: state.folders.filter(folder => folderIds.has(folder.id)), sets: sets.map(set => ({ ...set, cards: set.cards.map(({ front, back, tags, notes, hint, flagged, state: cardState, missed, correctStreak, reviewCount }) => ({ front, back, tags, notes, hint, flagged, state: cardState, missed, correctStreak, reviewCount })) })) }; downloadLocalFile('recall-decks.recall', JSON.stringify(payload, null, 2), 'application/json'); showToast(`${sets.length} deck${sets.length === 1 ? '' : 's'} exported without session history.`); }
function selectedCards() { return activeCards().filter(card => state.selectedCardIds.has(card.id)); }
function openCardEditor(id) { const card = activeCards().find(item => item.id === id); if (!card) return; state.editingCardId = id; elements.editFront.value = card.front; elements.editBack.value = card.back; elements.editTags.value = card.tags.join(', '); elements.editHint.value = card.hint; elements.editNotes.value = card.notes; elements.cardEditor.hidden = false; setTimeout(() => elements.editFront.focus(), 0); }
function closeCardEditor() { elements.cardEditor.hidden = true; state.editingCardId = null; }
function allTags() { return Array.from(new Set(state.sets.flatMap(set => [...cleanTags(set.tags), ...set.cards.flatMap(card => card.tags)]))).sort((a, b) => a.localeCompare(b)); }
function renderTagManager() { const tags = allTags(); elements.tagDialogList.innerHTML = tags.length ? tags.map(tag => `<div><span>${escapeHtml(tag)}</span><button type="button" data-rename-tag="${escapeHtml(tag)}">Rename</button><button type="button" data-delete-tag="${escapeHtml(tag)}">Delete</button></div>`).join('') : '<p class="attempts-empty">No tags yet. Add one to a card or create it here.</p>'; }
function openTagManager() { renderTagManager(); elements.tagDialog.hidden = false; }
function closeTagManager() { elements.tagDialog.hidden = true; }
function renameTag(from, to) { const next = String(to || '').trim(); if (!next || next === from) return; state.sets.forEach(set => set.cards.forEach(card => { card.tags = card.tags.map(tag => tag === from ? next : tag); })); state.selectedTags = state.selectedTags.map(tag => tag === from ? next : tag); save(); render(); renderTagManager(); }
function deleteTag(tag) { state.sets.forEach(set => set.cards.forEach(card => { card.tags = card.tags.filter(item => item !== tag); })); state.selectedTags = state.selectedTags.filter(item => item !== tag); save(); render(); renderTagManager(); }
function createSetForImport(name) { const set = { id: makeId(), name: name || `Imported set ${state.sets.length + 1}`, folderId: null, frontLabel: 'First side', backLabel: 'Second side', order: state.sets.length, createdAt: Date.now(), cards: [] }; state.sets.push(set); return set; }
function confirmImportPreview() {
  const draft = state.importDraft; if (!draft) return; const rows = draft.rows.filter(row => row.include).map(row => ({ row, card: mappedCard(row) })).filter(item => item.card.front && item.card.back); const duplicateMode = elements.duplicateMode.value;
  if (draft.kind === 'share') {
    const shareMode = elements.shareImportMode.value; let imported = 0; const foldersByName = new Map(state.folders.map(folder => [folder.name, folder]));
    draft.sets.forEach(sourceSet => { let destination = state.sets.find(set => set.name === sourceSet.name); if (shareMode === 'skip' && destination) return; if (shareMode === 'copy' || !destination) { destination = createSetForImport(shareMode === 'copy' && state.sets.some(set => set.name === sourceSet.name) ? `${sourceSet.name} copy` : sourceSet.name); destination.frontLabel = sourceSet.frontLabel || 'First side'; destination.backLabel = sourceSet.backLabel || 'Second side'; const sourceFolder = draft.folders.find(folder => folder.id === sourceSet.folderId); if (sourceFolder) { let folder = foldersByName.get(sourceFolder.name); if (!folder) { folder = { id: makeId(), name: sourceFolder.name, color: sourceFolder.color || FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length], order: state.folders.length }; state.folders.push(folder); foldersByName.set(folder.name, folder); } destination.folderId = folder.id; } }
      const cards = rows.filter(item => item.row.sourceSet === sourceSet.name).map(item => ({ ...item.card, ...item.row.original })); imported += addCards(cards, duplicateMode, destination);
    });
    save(); buildQueue(); closeImportPreview(); showToast(`${imported} shared card${imported === 1 ? '' : 's'} imported.`); return;
  }
  let destination = elements.importDestination.value === 'active' ? activeSet() : state.sets.find(set => set.id === elements.importDestination.value);
  if (elements.importDestination.value === 'new') { const name = prompt('Name the new deck:', 'Imported deck'); if (!name) return; destination = createSetForImport(name.trim()); }
  const imported = addCards(rows.map(item => item.card), duplicateMode, destination); closeImportPreview(); elements.importInput.value = ''; elements.importStatus.textContent = `${imported} card${imported === 1 ? '' : 's'} imported to ${destination.name}.`; showToast(`${imported} card${imported === 1 ? '' : 's'} imported.`);
}

function closeLibrary() { elements.drawer.classList.remove('open'); elements.scrim.classList.remove('open'); elements.drawer.setAttribute('aria-hidden', 'true'); }
function openLibrary() { renderLibrary(); elements.drawer.classList.add('open'); elements.scrim.classList.add('open'); elements.drawer.setAttribute('aria-hidden', 'false'); }
function openFullLibrary() { closeLibrary(); elements.fullLibrary.hidden = false; document.body.classList.add('full-library-open'); renderFullLibrary(); }
function closeFullLibrary() { elements.fullLibrary.hidden = true; document.body.classList.remove('full-library-open'); }
function closeAttempts() { elements.attemptsDrawer.classList.remove('open'); elements.attemptsScrim.classList.remove('open'); elements.attemptsDrawer.setAttribute('aria-hidden', 'true'); }
function openAttempts() { renderAttempts(); elements.attemptsDrawer.classList.add('open'); elements.attemptsScrim.classList.add('open'); elements.attemptsDrawer.setAttribute('aria-hidden', 'false'); }
function openLibraryDialog(action, currentName = '') {
  libraryDialogAction = action;
  const creating = action.type === 'new-set' || action.type === 'new-folder';
  const noun = action.type.includes('folder') ? 'folder' : 'study set';
  elements.dialogEyebrow.textContent = creating ? 'Add to library' : 'Edit library item';
  elements.dialogTitle.textContent = `${creating ? 'Create' : 'Rename'} ${noun}`;
  elements.dialogLabel.firstChild.textContent = `Name `;
  elements.dialogInput.value = currentName;
  elements.dialog.hidden = false;
  setTimeout(() => { elements.dialogInput.focus(); elements.dialogInput.select(); }, 0);
}
function closeLibraryDialog() { elements.dialog.hidden = true; libraryDialogAction = null; }

let toastTimer;
function showToast(message) { elements.toast.textContent = message; elements.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600); }

$('#addCardForm').addEventListener('submit', event => { event.preventDefault(); const card = { front: elements.frontInput.value, back: elements.backInput.value, tags: cleanTags(elements.tagsInput.value), hint: elements.hintInput.value, notes: elements.notesInput.value }; const duplicate = findDuplicate(card); if (duplicate && !confirm('A card with the same two sides already exists. Keep another copy?')) return; const added = addCards([card]); if (added) { elements.frontInput.value = ''; elements.backInput.value = ''; elements.tagsInput.value = ''; elements.hintInput.value = ''; elements.notesInput.value = ''; elements.frontInput.focus(); showToast('Flashcard added to your deck.'); } });
$('#saveLabelsBtn').addEventListener('click', () => { const set = activeSet(); if (!set) return; set.frontLabel = elements.frontLabelInput.value.trim() || 'First side'; set.backLabel = elements.backLabelInput.value.trim() || 'Second side'; save(); render(); showToast('Side names saved for this study set.'); });
$('#importBtn').addEventListener('click', () => { const cards = parseList(elements.importInput.value, elements.importFormat.value); if (cards.length) openImportPreview(cards, ['First side', 'Second side']); else elements.importStatus.textContent = 'No pairs found. Choose a separator preset or try “Two lines = one card”.'; });
elements.card.addEventListener('click', event => { if (event.target.closest('button, input, form')) return; flip(); }); elements.correct.addEventListener('click', () => review('correct')); elements.retry.addEventListener('click', () => review('retry'));
elements.flag.addEventListener('click', () => { const card = currentCard(); if (!card || state.animating) return; card.flagged = !card.flagged; save(); render(); showToast(card.flagged ? 'Card flagged for later.' : 'Flag removed.'); });
elements.typedForm.addEventListener('submit', event => { event.preventDefault(); const card = currentCard(); if (!card || state.animating) return; if (state.typedChecked) { review(state.typedChecked.accepted ? 'correct' : 'retry'); return; } const showFront = state.flipped ? state.startSide !== 'front' : state.startSide === 'front'; const expected = showFront ? card.back : card.front; state.typedChecked = { accepted: answersMatch(elements.typedInput.value, expected) }; render(); });
elements.undo.addEventListener('click', undoReview); elements.fullscreen.addEventListener('click', enterFocus); elements.exitFocus.addEventListener('click', exitFocus);
document.querySelectorAll('.segment').forEach(button => button.addEventListener('click', () => { state.startSide = button.dataset.side; state.flipped = false; document.querySelectorAll('.segment').forEach(item => item.classList.toggle('active', item === button)); render(); }));
function closeSessionMenu() { elements.sessionMenu.hidden = true; elements.sessionMenuBtn.setAttribute('aria-expanded', 'false'); }
function closeSettingsMenu() { elements.settingsMenu.hidden = true; elements.settingsBtn.setAttribute('aria-expanded', 'false'); }
elements.settingsBtn.addEventListener('click', event => { event.stopPropagation(); const opening = elements.settingsMenu.hidden; elements.settingsMenu.hidden = !opening; elements.settingsBtn.setAttribute('aria-expanded', String(opening)); });
elements.settingsMenu.addEventListener('click', event => event.stopPropagation());
elements.themeSelect.addEventListener('change', () => { state.theme = elements.themeSelect.value; applyTheme(); save(); });
const keybindInputs = { flip: elements.keybindFlip, retry: elements.keybindRetry, correct: elements.keybindCorrect, undo: elements.keybindUndo };
Object.entries(keybindInputs).forEach(([action, input]) => input.addEventListener('keydown', event => { event.preventDefault(); if (event.key === 'Escape') { input.blur(); return; } const key = event.key.toLowerCase(); if (key.length !== 1 && !key.startsWith('arrow')) return; state.keybinds[action] = key; renderKeybinds(); save(); }));
elements.resetKeybinds.addEventListener('click', () => { state.keybinds = { ...DEFAULT_KEYBINDS }; renderKeybinds(); save(); });
elements.sessionMenuBtn.addEventListener('click', event => { event.stopPropagation(); const opening = elements.sessionMenu.hidden; elements.sessionMenu.hidden = !opening; elements.sessionMenuBtn.setAttribute('aria-expanded', String(opening)); });
elements.sessionMenu.addEventListener('click', event => event.stopPropagation());
elements.applySession.addEventListener('click', () => { state.shuffled = elements.sessionShuffle.checked; state.repeatMissed = elements.repeatMissed.checked; state.studyFilter = elements.studyFilter.value; state.studyMode = elements.studyMode.value; buildQueue(); closeSessionMenu(); showToast(`New ${state.studyMode === 'typed' ? 'typed-answer' : 'flip-card'} session: ${state.studyFilter === 'all' ? 'all cards' : `${state.studyFilter} cards`}.`); });
document.addEventListener('click', () => { closeSessionMenu(); closeSettingsMenu(); });
elements.heatmapGrid.addEventListener('mouseover', event => { const day = event.target.dataset.heatmapDay; if (day) elements.heatmapTip.textContent = heatmapDetails(day, state.activity[day]); });
elements.deckList.addEventListener('click', event => { const id = event.target.dataset.delete; if (id) { const set = activeSet(); set.cards = set.cards.filter(card => card.id !== id); state.selectedCardIds.delete(id); save(); buildQueue(); showToast('Card removed.'); return; } const editId = event.target.dataset.edit; if (editId) openCardEditor(editId); });
elements.deckList.addEventListener('change', event => { const id = event.target.dataset.selectCard; if (!id) return; if (event.target.checked) state.selectedCardIds.add(id); else state.selectedCardIds.delete(id); renderDeck(); });
elements.clearDeck.addEventListener('click', () => { if (!activeCards().length || !confirm(`Clear every card from “${activeSet().name}”?`)) return; activeSet().cards = []; save(); buildQueue(); showToast('Set cleared.'); });
$('#clearProgressBtn').addEventListener('click', () => { if (activeCards().length) { buildQueue(); showToast('Session reset. You are ready to go again.'); } });
elements.revealHint.addEventListener('click', () => { if (!currentCard()?.hint) return; state.hintRevealed = !state.hintRevealed; render(); });
elements.deckSearch.addEventListener('input', () => { state.deckSearch = elements.deckSearch.value; renderDeck(); });
elements.clearSearch.addEventListener('click', () => { state.deckSearch = ''; elements.deckSearch.value = ''; renderDeck(); elements.deckSearch.focus(); });
elements.tagFilterOptions.addEventListener('change', () => { state.selectedTags = [...elements.tagFilterOptions.querySelectorAll('input:checked')].map(input => input.value); elements.tagFilterSummary.textContent = state.selectedTags.length ? `${state.selectedTags.length} selected` : 'All tags'; buildQueue(); });
elements.selectCards.addEventListener('click', () => { state.selectingCards = !state.selectingCards; if (!state.selectingCards) state.selectedCardIds.clear(); renderDeck(); });
elements.bulkTag.addEventListener('click', () => { const tag = prompt('Tag to add to selected cards:'); if (!tag) return; selectedCards().forEach(card => { card.tags = cleanTags([...card.tags, tag]); }); save(); render(); });
elements.bulkRemoveTag.addEventListener('click', () => { const tag = prompt('Tag to remove from selected cards:'); if (!tag) return; selectedCards().forEach(card => { card.tags = card.tags.filter(item => item !== tag.trim()); }); save(); render(); });
elements.bulkMoveDeck.addEventListener('change', () => { const destination = state.sets.find(set => set.id === elements.bulkMoveDeck.value); const cards = selectedCards(); if (!destination || !cards.length) return; activeSet().cards = activeCards().filter(card => !state.selectedCardIds.has(card.id)); destination.cards.push(...cards); state.selectedCardIds.clear(); save(); buildQueue(); showToast(`${cards.length} card${cards.length === 1 ? '' : 's'} moved to ${destination.name}.`); });
elements.bulkDuplicate.addEventListener('click', () => { const copies = selectedCards().map(card => ({ ...card, id: makeId(), state: 'New', missed: false, correctStreak: 0, reviewCount: 0 })); if (!copies.length) return; activeSet().cards.push(...copies); save(); buildQueue(); showToast(`${copies.length} card${copies.length === 1 ? '' : 's'} duplicated.`); });
elements.bulkDelete.addEventListener('click', () => { const cards = selectedCards(); if (!cards.length || !confirm(`Delete ${cards.length} selected card${cards.length === 1 ? '' : 's'}?`)) return; activeSet().cards = activeCards().filter(card => !state.selectedCardIds.has(card.id)); state.selectedCardIds.clear(); save(); buildQueue(); showToast('Selected cards deleted.'); });
elements.exportDeck.addEventListener('click', () => exportDeck(',')); elements.exportTsv.addEventListener('click', () => exportDeck('\t')); elements.shareDecks.addEventListener('click', exportShare);
elements.shareDeckOptions.addEventListener('change', () => { elements.shareDeckSummary.textContent = `${elements.shareDeckOptions.querySelectorAll('input:checked').length} selected`; });
elements.manageTags.addEventListener('click', openTagManager); elements.tagDialogClose.addEventListener('click', closeTagManager); elements.newTag.addEventListener('click', () => { const tag = prompt('Name the new tag:'); if (!tag) return; const name = tag.trim(); if (!name || allTags().includes(name)) return; const card = activeCards()[0]; if (card) { card.tags = cleanTags([...card.tags, name]); save(); render(); } else showToast('Create a card first, then assign this tag.'); renderTagManager(); });
elements.tagDialogList.addEventListener('click', event => { const rename = event.target.dataset.renameTag; const remove = event.target.dataset.deleteTag; if (rename) renameTag(rename, prompt('Rename tag:', rename)); if (remove && confirm(`Delete the “${remove}” tag from all cards?`)) deleteTag(remove); });
elements.cardEditorCancel.addEventListener('click', closeCardEditor); elements.cardEditor.addEventListener('click', event => { if (event.target === elements.cardEditor) closeCardEditor(); });
elements.cardEditorForm.addEventListener('submit', event => { event.preventDefault(); const card = activeCards().find(item => item.id === state.editingCardId); if (!card) return closeCardEditor(); const next = { front: elements.editFront.value.trim(), back: elements.editBack.value.trim(), tags: cleanTags(elements.editTags.value), hint: elements.editHint.value.trim(), notes: elements.editNotes.value.trim() }; if (!next.front || !next.back) return; const duplicate = findDuplicate(next, activeCards().filter(item => item.id !== card.id)); if (duplicate && !confirm('Another card has the same sides. Save anyway?')) return; Object.assign(card, next); save(); closeCardEditor(); buildQueue(); showToast('Card details saved.'); });
elements.fileImport.addEventListener('change', async () => { const file = elements.fileImport.files[0]; if (!file) return; const text = await file.text(); try { const parsed = JSON.parse(text); if (parsed?.format === 'recall-share-v1') openSharePreview(parsed); else throw new Error('not share'); } catch { const delimiter = file.name.toLocaleLowerCase().endsWith('.tsv') ? '\t' : ','; const rows = parseDelimited(text, delimiter); if (rows.length > 1) { state.importDraft = rowsToImportDraft(rows); renderImportPreview(); elements.importPreview.hidden = false; } else showToast('That file has no importable rows.'); } elements.fileImport.value = ''; });
['mapFront', 'mapBack', 'mapTags', 'mapNotes', 'mapHint'].forEach(key => elements[key].addEventListener('change', () => { state.importDraft.defaults[key.replace('map', '').toLowerCase()] = Number(elements[key].value); renderImportPreview(); }));
elements.importPreviewRows.addEventListener('change', event => { const row = state.importDraft?.rows.find(item => item.id === event.target.dataset.importInclude); if (row) { row.include = event.target.checked; renderImportPreview(); } });
elements.importPreviewRows.addEventListener('change', event => { const row = state.importDraft?.rows.find(item => item.id === event.target.dataset.importRow); if (!row) return; const field = event.target.dataset.importEdit; const index = state.importDraft.defaults[field]; if (index >= 0) row.cells[index] = event.target.value; renderImportPreview(); });
elements.importPreviewClose.addEventListener('click', closeImportPreview); elements.importPreviewCancel.addEventListener('click', closeImportPreview); elements.confirmImport.addEventListener('click', confirmImportPreview);

$('#libraryTrigger').addEventListener('click', openLibrary); $('#libraryClose').addEventListener('click', closeLibrary); elements.scrim.addEventListener('click', closeLibrary);
$('#fullLibraryBtn').addEventListener('click', openFullLibrary); $('#fullLibraryClose').addEventListener('click', closeFullLibrary); $('#fullNewSetBtn').addEventListener('click', () => openLibraryDialog({ type: 'new-set' }, `New set ${state.sets.length + 1}`)); $('#fullNewFolderBtn').addEventListener('click', () => openLibraryDialog({ type: 'new-folder' }, `Folder ${state.folders.length + 1}`));
$('#attemptsTrigger').addEventListener('click', openAttempts); $('#attemptsClose').addEventListener('click', closeAttempts); elements.attemptsScrim.addEventListener('click', closeAttempts);
function moveSet(setId, direction) {
  const set = state.sets.find(item => item.id === setId); if (!set) return;
  const siblings = state.sets.filter(item => item.folderId === set.folderId).sort((a, b) => a.order - b.order);
  const index = siblings.indexOf(set); const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]]; reindex(siblings); save(); renderLibrary();
}
function moveFolder(folderId, direction) {
  const folders = [...state.folders].sort((a, b) => a.order - b.order); const index = folders.findIndex(folder => folder.id === folderId); const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= folders.length) return;
  [folders[index], folders[target]] = [folders[target], folders[index]]; reindex(folders); save(); renderLibrary();
}
function deleteSet(setId) {
  const set = state.sets.find(item => item.id === setId); if (!set) return;
  state.sets = state.sets.filter(item => item.id !== setId);
  if (!state.sets.length) state.sets.push({ id: makeId(), name: 'My study deck', folderId: null, frontLabel: 'First side', backLabel: 'Second side', order: 0, createdAt: Date.now(), cards: [] });
  if (state.activeSetId === setId) state.activeSetId = state.sets[0].id;
  save(); buildQueue(); renderLibrary(); showToast(`“${set.name}” deleted.`);
}
function deleteFolder(folderId) {
  const folder = state.folders.find(item => item.id === folderId); if (!folder) return;
  const movedSets = state.sets.filter(set => set.folderId === folderId);
  movedSets.forEach((set, index) => { set.folderId = null; set.order = state.sets.filter(item => !item.folderId && item.id !== set.id).length + index; });
  state.folders = state.folders.filter(item => item.id !== folderId);
  save(); renderLibrary(); showToast(`“${folder.name}” deleted; its decks are now ungrouped.`);
}
function moveSetToFolder(setId, folderId) {
  const set = state.sets.find(item => item.id === setId); if (!set) return;
  set.folderId = folderId || null;
  const siblings = state.sets.filter(item => item.folderId === set.folderId && item.id !== set.id);
  set.order = siblings.length ? Math.max(...siblings.map(item => item.order)) + 1 : 0;
  save(); renderLibrary(); showToast(set.folderId ? 'Set moved into folder.' : 'Set moved out of folder.');
}
function handleLibraryClick(event) {
  const toggleFolder = event.target.closest('[data-toggle-folder]');
  if (toggleFolder && toggleFolder.dataset.toggleFolder) { const folder = state.folders.find(item => item.id === toggleFolder.dataset.toggleFolder); if (folder) { folder.collapsed = !folder.collapsed; save(); renderLibrary(); } return; }
  const renameSet = event.target.closest('[data-rename-set]')?.dataset.renameSet;
  const deleteSetId = event.target.closest('[data-delete-set]')?.dataset.deleteSet;
  if (deleteSetId) { const set = state.sets.find(item => item.id === deleteSetId); if (set && confirm(`Delete “${set.name}” and all of its cards?`)) deleteSet(deleteSetId); return; }
  if (renameSet) { const set = state.sets.find(item => item.id === renameSet); if (set) openLibraryDialog({ type: 'rename-set', id: set.id }, set.name); return; }
  const renameFolder = event.target.closest('[data-rename-folder]')?.dataset.renameFolder;
  const deleteFolderId = event.target.closest('[data-delete-folder]')?.dataset.deleteFolder;
  if (deleteFolderId) { const folder = state.folders.find(item => item.id === deleteFolderId); if (folder && confirm(`Delete the “${folder.name}” folder? Its decks will be kept and moved to Ungrouped.`)) deleteFolder(deleteFolderId); return; }
  if (renameFolder) { const folder = state.folders.find(item => item.id === renameFolder); if (folder) openLibraryDialog({ type: 'rename-folder', id: folder.id }, folder.name); return; }
  const moveSetId = event.target.closest('[data-move-set]')?.dataset.moveSet;
  if (moveSetId) { moveSet(moveSetId, event.target.closest('[data-move-set]').dataset.direction); return; }
  const moveFolderId = event.target.closest('[data-move-folder]')?.dataset.moveFolder;
  if (moveFolderId) { moveFolder(moveFolderId, event.target.closest('[data-move-folder]').dataset.direction); return; }
  const setId = event.target.closest('[data-set]')?.dataset.set;
  if (!setId) return; state.activeSetId = setId; save(); buildQueue(); closeLibrary(); closeFullLibrary(); document.querySelector('#study').scrollIntoView({ behavior: 'smooth' });
}
function handleLibraryChange(event) {
  const folderId = event.target.dataset.folderColor;
  if (folderId) { const folder = state.folders.find(item => item.id === folderId); if (folder) { folder.color = event.target.value; save(); renderLibrary(); showToast('Folder colour updated.'); } }
}
function handleLibraryDragStart(event) { const set = event.target.closest('[data-drag-set]'); if (!set) return; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', set.dataset.dragSet); }
function handleLibraryDragOver(event) { const folder = event.target.closest('[data-drop-folder]'); if (!folder) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; folder.classList.add('drag-over'); }
function handleLibraryDragLeave(event) { event.target.closest('[data-drop-folder]')?.classList.remove('drag-over'); }
function handleLibraryDrop(event) { const folder = event.target.closest('[data-drop-folder]'); if (!folder) return; event.preventDefault(); document.querySelectorAll('.drag-over').forEach(item => item.classList.remove('drag-over')); const setId = event.dataTransfer.getData('text/plain'); if (setId) moveSetToFolder(setId, folder.dataset.dropFolder); }
[elements.libraryTree, elements.fullLibraryGrid].forEach(container => { container.addEventListener('click', handleLibraryClick); container.addEventListener('change', handleLibraryChange); container.addEventListener('dragstart', handleLibraryDragStart); container.addEventListener('dragover', handleLibraryDragOver); container.addEventListener('dragleave', handleLibraryDragLeave); container.addEventListener('drop', handleLibraryDrop); });
elements.librarySearch.addEventListener('input', renderLibrary); elements.librarySort.addEventListener('change', renderLibrary); elements.fullLibrarySearch.addEventListener('input', renderFullLibrary); elements.fullLibrarySort.addEventListener('change', renderFullLibrary);
$('#newSetBtn').addEventListener('click', () => openLibraryDialog({ type: 'new-set' }, `New set ${state.sets.length + 1}`));
$('#newFolderBtn').addEventListener('click', () => openLibraryDialog({ type: 'new-folder' }, `Folder ${state.folders.length + 1}`));
elements.dialogCancel.addEventListener('click', closeLibraryDialog);
elements.dialog.addEventListener('click', event => { if (event.target === elements.dialog) closeLibraryDialog(); });
function saveLibraryDialog() {
  const name = elements.dialogInput.value.trim(); const action = libraryDialogAction;
  if (!name || !action) return;
  closeLibraryDialog();
  if (action.type === 'new-set') {
    const set = { id: makeId(), name, folderId: null, frontLabel: 'First side', backLabel: 'Second side', order: state.sets.length, createdAt: Date.now(), cards: [] };
    state.sets.push(set); state.activeSetId = set.id; save(); buildQueue(); if (elements.fullLibrary.hidden) openLibrary(); else renderFullLibrary(); showToast('New study set created.'); return;
  }
  if (action.type === 'new-folder') {
    state.folders.push({ id: makeId(), name, color: FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length], order: state.folders.length }); save(); renderLibrary(); showToast('Folder created.'); return;
  }
  if (action.type === 'rename-set') { const set = state.sets.find(item => item.id === action.id); if (set) set.name = name; }
  if (action.type === 'rename-folder') { const folder = state.folders.find(item => item.id === action.id); if (folder) folder.name = name; }
  save(); render(); showToast('Library item renamed.');
}
elements.dialogSave.addEventListener('click', saveLibraryDialog);
elements.dialogForm.addEventListener('submit', event => { event.preventDefault(); saveLibraryDialog(); });

document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('focus-study'); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !elements.dialog.hidden) { closeLibraryDialog(); return; } if (event.key === 'Escape' && !elements.cardEditor.hidden) { closeCardEditor(); return; } if (event.key === 'Escape' && !elements.tagDialog.hidden) { closeTagManager(); return; } if (event.key === 'Escape' && !elements.importPreview.hidden) { closeImportPreview(); return; } if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return; if (event.key === 'Escape') { closeLibrary(); closeSessionMenu(); if (document.body.classList.contains('focus-study')) exitFocus(); } if (event.key.toLowerCase() === 'z') { event.preventDefault(); undoReview(); } if (event.key.toLowerCase() === 'f') { event.preventDefault(); document.body.classList.contains('focus-study') ? exitFocus() : enterFocus(); } if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); flip(); } if (state.studyMode !== 'typed' && event.key === 'ArrowLeft') { event.preventDefault(); review('retry'); } if (state.studyMode !== 'typed' && event.key === 'ArrowRight') { event.preventDefault(); review('correct'); } });

document.addEventListener('keydown', event => { if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return; const key = event.key.toLowerCase(); if (key === state.keybinds.undo) { event.preventDefault(); undoReview(); } if (key === 'w' || key === 's' || key === state.keybinds.flip) { event.preventDefault(); flip(); } if (state.studyMode !== 'typed' && (key === 'a' || key === state.keybinds.retry)) { event.preventDefault(); review('retry'); } if (state.studyMode !== 'typed' && (key === 'd' || key === state.keybinds.correct)) { event.preventDefault(); review('correct'); } });
load();
migrateTestHistory();

// Test mode is deliberately separate from study: it records assessment results without
// changing any card's learning state, missed flag, or review history.
const testMode = document.createElement('section');
testMode.id = 'testMode'; testMode.className = 'test-mode'; testMode.hidden = true; testMode.setAttribute('aria-label', 'Test mode');
document.body.append(testMode);
const testModeButton = document.createElement('button');
testModeButton.id = 'testModeBtn'; testModeButton.className = 'test-trigger'; testModeButton.type = 'button'; testModeButton.textContent = 'Test mode';
$('#libraryTrigger').insertAdjacentElement('afterend', testModeButton);
let testTimer = null;

function testAllTags() { return Array.from(new Set(state.sets.flatMap(set => set.cards.flatMap(card => card.tags || [])))).sort((a, b) => a.localeCompare(b)); }
function testFormatDuration(ms) { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function testDeckChoices(selected = [activeSet()?.id]) {
  return state.sets.map(set => `<label class="test-check"><input data-test-deck type="checkbox" value="${set.id}" ${selected.includes(set.id) ? 'checked' : ''}/><span>${escapeHtml(set.name)}</span><small>${set.cards.length} cards</small></label>`).join('');
}
function testFolderChoices() {
  return state.folders.map(folder => `<label class="test-check"><input data-test-folder type="checkbox" value="${folder.id}"/><span><i style="background:${folder.color}"></i>${escapeHtml(folder.name)}</span><small>${state.sets.filter(set => set.folderId === folder.id).length} decks</small></label>`).join('') || '<p class="test-muted">No folders yet.</p>';
}
function testTagChoices() {
  const tags = testAllTags(); return tags.map(tag => `<label class="test-tag"><input data-test-tag type="checkbox" value="${escapeHtml(tag)}"/><span>${escapeHtml(tag)}</span></label>`).join('') || '<p class="test-muted">No tags yet.</p>';
}
function openTestSetup() {
  clearInterval(testTimer); state.activeTest = null; testMode.hidden = false;
  testMode.innerHTML = `<div class="test-shell"><header class="test-head"><div><p class="eyebrow">Assessment</p><h1>Build a test.</h1><p>Tests are scored separately and never change your card learning states.</p></div><button class="drawer-close" data-test-action="close" type="button" aria-label="Close test mode">×</button></header><div class="test-setup-grid"><section class="test-panel"><h2>Choose material</h2><div class="test-choice-group"><h3>Decks</h3><div class="test-check-list">${testDeckChoices()}</div></div><div class="test-choice-group"><h3>Folders</h3><div class="test-check-list">${testFolderChoices()}</div></div><div class="test-choice-group"><h3>Tags <small>optional</small></h3><div class="test-tags">${testTagChoices()}</div></div></section><section class="test-panel"><h2>Test rules</h2><label class="test-field">Questions<input id="testQuestionCount" type="number" min="1" value="10" /></label><label class="test-field">Include cards<select id="testCardFilter"><option value="all">All cards</option><option value="new">New cards</option><option value="learning">Learning cards</option><option value="mastered">Mastered cards</option><option value="missed">Missed cards</option><option value="flagged">Flagged cards</option></select></label><label class="test-field">Answer style<select id="testAnswerStyle"><option value="typed">Typed answer only</option><option value="choice">Multiple choice only</option><option value="mixed">Mixed mode</option></select></label><label class="test-field">Show first<select id="testPromptSide"><option value="front">First side</option><option value="back">Second side</option></select></label><label class="test-toggle"><span><b>Timed test</b><small>Track elapsed time for every answer.</small></span><input id="testTimed" type="checkbox" checked /></label><p class="test-pool-note" id="testPoolNote"></p><button class="primary-button test-start" data-test-action="start" type="button">Start test <span>→</span></button></section></div></div>`;
  refreshTestPoolNote();
}
function testSetupConfig() {
  const deckIds = [...testMode.querySelectorAll('[data-test-deck]:checked')].map(input => input.value);
  const folderIds = [...testMode.querySelectorAll('[data-test-folder]:checked')].map(input => input.value);
  state.sets.filter(set => folderIds.includes(set.folderId)).forEach(set => deckIds.push(set.id));
  return { deckIds: [...new Set(deckIds)], tags: [...testMode.querySelectorAll('[data-test-tag]:checked')].map(input => input.value), count: Number($('#testQuestionCount')?.value) || 0, filter: $('#testCardFilter')?.value || 'all', style: $('#testAnswerStyle')?.value || 'typed', promptSide: $('#testPromptSide')?.value || 'front', timed: Boolean($('#testTimed')?.checked) };
}
function cardsForTest(config) {
  const deckIds = config.deckIds.length ? config.deckIds : [activeSet()?.id];
  return state.sets.filter(set => deckIds.includes(set.id)).flatMap(set => set.cards.map(card => ({ ...card, deckId: set.id, deckName: set.name, folderId: set.folderId, frontLabel: sideNames(set).front, backLabel: sideNames(set).back }))).filter(card => {
    const matchesTags = !config.tags.length || config.tags.every(tag => card.tags.includes(tag));
    const matchesFilter = config.filter === 'all' || (config.filter === 'new' && card.state === 'New') || (config.filter === 'learning' && card.state === 'Learning') || (config.filter === 'mastered' && card.state === 'Mastered') || (config.filter === 'missed' && card.missed) || (config.filter === 'flagged' && card.flagged);
    return matchesTags && matchesFilter;
  });
}
function refreshTestPoolNote() {
  const note = $('#testPoolNote'); if (!note) return; const config = testSetupConfig(); const pool = cardsForTest(config); const requested = Math.max(0, config.count);
  note.textContent = pool.length ? `${Math.min(requested, pool.length)} question${Math.min(requested, pool.length) === 1 ? '' : 's'} from ${pool.length} matching card${pool.length === 1 ? '' : 's'}. Cards will not repeat.` : 'No cards match these choices yet.';
}
function testChoicePool(question) {
  const all = state.sets.flatMap(set => set.cards.map(card => ({ ...card, deckId: set.id, deckName: set.name, folderId: set.folderId })));
  const sameDeck = all.filter(card => card.deckId === question.deckId);
  const sameFolder = all.filter(card => question.folderId && card.folderId === question.folderId && card.deckId !== question.deckId);
  const sharedTags = all.filter(card => card.deckId !== question.deckId && card.tags.some(tag => question.tags.includes(tag)));
  const seen = new Set(); return [...sameDeck, ...sameFolder, ...sharedTags, ...all].filter(card => { const key = `${card.deckId}:${card.id}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
function startTest() {
  const config = testSetupConfig(); const pool = cardsForTest(config); const questions = RecallTest.selectQuestions(pool, config.count);
  if (!questions.length) { refreshTestPoolNote(); return showToast('Choose at least one matching card to start a test.'); }
  if (config.style !== 'typed' && questions.some(question => RecallTest.choicesFor(question, testChoicePool(question), config.promptSide).length < 4)) return showToast('Multiple choice needs four distinct answers. Add more cards or use typed answers.');
  const startedAt = new Date().toISOString();
  state.activeTest = { id: makeId(), config, pool, questions: questions.map(card => ({ ...card, answerType: config.style === 'mixed' ? (Math.random() < .5 ? 'typed' : 'choice') : config.style, choices: null })), answers: [], currentIndex: 0, startedAt, questionStartedAt: Date.now(), feedback: null };
  renderTestQuestion();
}
function activeTestQuestion() { return state.activeTest?.questions[state.activeTest.currentIndex]; }
function testAnswerValue(question) { return state.activeTest.config.promptSide === 'front' ? question.back : question.front; }
function testPromptValue(question) { return state.activeTest.config.promptSide === 'front' ? question.front : question.back; }
function renderTestQuestion() {
  const test = state.activeTest; const question = activeTestQuestion(); if (!test || !question) return finishTest();
  const promptName = test.config.promptSide === 'front' ? question.frontLabel : question.backLabel; const answerName = test.config.promptSide === 'front' ? question.backLabel : question.frontLabel;
  if (question.answerType === 'choice' && !question.choices) question.choices = RecallTest.choicesFor(question, testChoicePool(question), test.config.promptSide);
  const feedback = test.feedback; const answered = Boolean(feedback);
  const input = question.answerType === 'typed' ? `<form class="test-answer-form" id="testTypedForm"><label>Type your answer<input id="testTypedInput" autocomplete="off" autofocus ${answered ? 'disabled' : ''}/></label><button class="primary-button" type="submit" ${answered ? 'disabled' : ''}>Submit <kbd>Enter</kbd></button></form>` : `<div class="test-choices">${question.choices.map((choice, index) => `<button class="test-choice ${answered ? (RecallTest.answersMatch(choice, testAnswerValue(question)) ? 'correct' : feedback.userAnswer === choice ? 'incorrect' : '') : ''}" data-test-choice="${index}" type="button" ${answered ? 'disabled' : ''}><kbd>${index + 1}</kbd><span>${escapeHtml(choice)}</span></button>`).join('')}</div>`;
  testMode.innerHTML = `<div class="test-shell test-running"><header class="test-head"><div><p class="eyebrow">${escapeHtml(question.deckName)}</p><h1>Question ${test.currentIndex + 1} <em>of ${test.questions.length}</em></h1></div><div class="test-running-actions">${test.config.timed ? `<span class="test-timer" id="testElapsed">${testFormatDuration(Date.now() - new Date(test.startedAt))}</span>` : '<span class="test-timer">Untimed</span>'}<button class="text-button" data-test-action="exit" type="button">Exit test</button></div></header><main class="test-question"><div class="test-question-meta"><span>${escapeHtml(promptName)} · PROMPT</span><span class="card-state ${question.state.toLowerCase()}">${question.state}</span></div><article class="test-card"><p>${escapeHtml(testPromptValue(question))}</p></article><p class="test-answer-label">Answer in <b>${escapeHtml(answerName)}</b></p>${input}${answered ? `<section class="test-feedback ${feedback.result}"><strong>${feedback.result === 'correct' ? 'Correct' : 'Not quite'}</strong><span>Expected answer: <b>${escapeHtml(testAnswerValue(question))}</b></span></section>` : ''}<div class="test-question-footer"><button class="text-button" data-test-action="skip" type="button" ${answered ? 'disabled' : ''}>Skip question</button>${answered ? `<button class="primary-button" data-test-action="next" type="button">${test.currentIndex === test.questions.length - 1 ? 'See results' : 'Next question'} <span>→</span></button>` : ''}</div></main></div>`;
  clearInterval(testTimer); if (test.config.timed) testTimer = setInterval(() => { const timer = $('#testElapsed'); if (timer && state.activeTest) timer.textContent = testFormatDuration(Date.now() - new Date(state.activeTest.startedAt)); }, 1000);
  $('#testTypedForm')?.addEventListener('submit', event => { event.preventDefault(); submitTestAnswer($('#testTypedInput').value); });
}
function submitTestAnswer(value) {
  const test = state.activeTest; const question = activeTestQuestion(); if (!test || !question || test.feedback) return;
  const correctAnswer = testAnswerValue(question); const result = RecallTest.answersMatch(value, correctAnswer) ? 'correct' : 'incorrect';
  const answer = { questionId: question.id, deckId: question.deckId, deckName: question.deckName, tags: question.tags, prompt: testPromptValue(question), correctAnswer, userAnswer: value || '—', answerType: question.answerType, result, timeMs: Math.max(0, Date.now() - test.questionStartedAt) };
  test.answers.push(answer); test.feedback = answer; save(); renderTestQuestion();
}
function skipTestQuestion() {
  const test = state.activeTest; const question = activeTestQuestion(); if (!test || !question || test.feedback) return;
  test.answers.push({ questionId: question.id, deckId: question.deckId, deckName: question.deckName, tags: question.tags, prompt: testPromptValue(question), correctAnswer: testAnswerValue(question), userAnswer: 'Skipped', answerType: question.answerType, result: 'skipped', timeMs: Math.max(0, Date.now() - test.questionStartedAt) });
  nextTestQuestion();
}
function nextTestQuestion() { if (!state.activeTest) return; state.activeTest.currentIndex += 1; state.activeTest.feedback = null; state.activeTest.questionStartedAt = Date.now(); if (state.activeTest.currentIndex >= state.activeTest.questions.length) finishTest(); else renderTestQuestion(); }
function testAccuracyBreakdown(answers, key) { const groups = {}; answers.filter(answer => answer.result !== 'skipped').forEach(answer => { const values = key === 'tag' ? (answer.tags.length ? answer.tags : ['Untagged']) : [answer.deckName]; values.forEach(value => { const item = groups[value] ||= { total: 0, correct: 0 }; item.total += 1; if (answer.result === 'correct') item.correct += 1; }); }); return Object.entries(groups).map(([name, item]) => `<li><span>${escapeHtml(name)}</span><b>${item.total ? Math.round(item.correct / item.total * 100) : 0}%</b></li>`).join('') || '<li><span>No answered questions</span></li>'; }
function finishTest() {
  const test = state.activeTest; if (!test) return; clearInterval(testTimer); test.endedAt = new Date().toISOString(); test.summary = RecallTest.scoreTest(test); state.testHistory.push({ ...test }); state.activeTest = null; save(); renderTestResults(test);
}
function renderTestResults(test) {
  const summary = test.summary || RecallTest.scoreTest(test); const misses = test.answers.filter(answer => answer.result !== 'correct');
  testMode.innerHTML = `<div class="test-shell test-results"><header class="test-head"><div><p class="eyebrow">Test complete</p><h1>${summary.percentage}% <em>accuracy</em></h1><p>${summary.correct} correct · ${summary.incorrect} incorrect · ${summary.skipped} skipped · ${summary.unanswered} unanswered</p></div><button class="drawer-close" data-test-action="close" type="button" aria-label="Close results">×</button></header><section class="test-score-grid"><div><b>${testFormatDuration(summary.elapsedMs)}</b><span>time taken</span></div><div><b>${testFormatDuration(summary.averageMs)}</b><span>average per question</span></div><div><b>${summary.correct}/${summary.total}</b><span>final score</span></div></section><div class="test-results-grid"><section class="test-panel"><h2>Accuracy by deck</h2><ul class="test-breakdown">${testAccuracyBreakdown(test.answers, 'deck')}</ul><h2>Accuracy by tag</h2><ul class="test-breakdown">${testAccuracyBreakdown(test.answers, 'tag')}</ul></section><section class="test-panel"><h2>Review missed questions</h2><div class="test-missed-list">${misses.length ? misses.map(answer => `<article><span>${escapeHtml(answer.deckName)} · ${escapeHtml(answer.answerType === 'choice' ? 'Multiple choice' : 'Typed')}</span><strong>${escapeHtml(answer.prompt)}</strong><p>Your answer: ${escapeHtml(answer.userAnswer)}<br/>Correct answer: <b>${escapeHtml(answer.correctAnswer)}</b></p></article>`).join('') : '<p class="test-muted">Perfect score — nothing to revisit.</p>'}</div></section></div><footer class="test-results-actions"><button class="text-button" data-test-action="study-missed" type="button" ${misses.length ? '' : 'disabled'}>Study missed cards</button><button class="primary-button" data-test-action="retry-missed" type="button" ${misses.length ? '' : 'disabled'}>Retry missed <span>→</span></button><button class="text-button" data-test-action="close" type="button">Return to library</button></footer></div>`;
}
function retryMissedTest() {
  const last = state.testHistory.at(-1); const misses = last?.answers.filter(answer => answer.result !== 'correct') || []; if (!misses.length) return;
  const ids = new Set(misses.map(answer => `${answer.deckId}:${answer.questionId}`)); const questions = last.questions.filter(question => ids.has(`${question.deckId}:${question.id}`));
  state.activeTest = { id: makeId(), config: { ...last.config, count: questions.length }, pool: last.pool, questions: questions.map(question => ({ ...question, choices: null })), answers: [], currentIndex: 0, startedAt: new Date().toISOString(), questionStartedAt: Date.now(), feedback: null };
  renderTestQuestion();
}
function studyMissedTest() {
  const last = state.testHistory.at(-1); const first = last?.answers.find(answer => answer.result !== 'correct'); if (!first) return;
  const set = state.sets.find(item => item.id === first.deckId); const ids = new Set(last.answers.filter(answer => answer.result !== 'correct' && answer.deckId === first.deckId).map(answer => answer.questionId));
  if (!set) return; state.activeSetId = set.id; state.queue = shuffledCopy(set.cards.filter(card => ids.has(card.id))); state.currentIndex = 0; state.correct = 0; state.retry = 0; state.history = []; state.flipped = false; state.typedChecked = false; startNewSession(); testMode.hidden = true; render(); document.querySelector('#study').scrollIntoView({ behavior: 'smooth' }); showToast(`Normal study started with ${state.queue.length} missed card${state.queue.length === 1 ? '' : 's'} from ${set.name}.`);
}
function closeTestMode() { clearInterval(testTimer); state.activeTest = null; testMode.hidden = true; }

// Subject-aware deck styling. Subject tags are ordinary tags with the optional
// `Subject: Topic` convention; no separate subject database is introduced.
const deckSubjectButton = document.createElement('button'); deckSubjectButton.id = 'deckSubjectBtn'; deckSubjectButton.className = 'text-button'; deckSubjectButton.type = 'button'; deckSubjectButton.textContent = 'Deck details';
elements.clearDeck.insertAdjacentElement('beforebegin', deckSubjectButton);
const subjectColoursButton = document.createElement('button'); subjectColoursButton.id = 'subjectColoursBtn'; subjectColoursButton.className = 'settings-reset'; subjectColoursButton.type = 'button'; subjectColoursButton.textContent = 'Subject colours';
elements.resetKeybinds.insertAdjacentElement('beforebegin', subjectColoursButton);
const subjectDialog = document.createElement('div'); subjectDialog.className = 'library-dialog-backdrop'; subjectDialog.id = 'subjectDialog'; subjectDialog.hidden = true; document.body.append(subjectDialog);
const subjectColoursDialog = document.createElement('div'); subjectColoursDialog.className = 'library-dialog-backdrop'; subjectColoursDialog.id = 'subjectColoursDialog'; subjectColoursDialog.hidden = true; document.body.append(subjectColoursDialog);
function subjectsForDeck(deck) { return RecallSubjects.subjectsForDeck(deck); }
function resolvedDeckSubject(deck) { return RecallSubjects.accentForDeck(deck, state.subjectColors); }
function deckSubjectDots(deck) { const subjects = subjectsForDeck(deck); if (!subjects.length) return ''; return `<span class="subject-dots" aria-label="Subjects: ${escapeHtml(subjects.join(', '))}" title="Subjects: ${escapeHtml(subjects.join(', '))}">${subjects.map(subject => `<i style="--subject-colour:${RecallSubjects.colourForSubject(subject, state.subjectColors)}" title="${escapeHtml(subject)}"></i>`).join('')}</span>`; }
function deckAccentStyle(deck) { const accent = resolvedDeckSubject(deck); return accent.colour ? `style="--subject-accent:${accent.colour}"` : ''; }
function applyActiveSubjectAccent() { const deck = activeSet(); const accent = resolvedDeckSubject(deck); const summary = document.querySelector('.deck-summary'); const session = document.querySelector('.session-panel'); [summary, session].forEach(node => { if (!node) return; node.style.setProperty('--subject-accent', accent.colour || ''); node.classList.toggle('has-subject', Boolean(accent.colour)); }); }
function renderLibrary() {
  const filter = elements.librarySearch.value; const mode = elements.librarySort.value; const manual = mode === 'manual'; elements.libraryTree.innerHTML = '';
  libraryGroups(filter, mode).forEach(({ folder, sets, ungrouped }) => { const group = document.createElement('section'); group.className = `library-folder ${ungrouped ? 'ungrouped-folder' : ''}`; group.dataset.dropFolder = folder?.id || ''; const color = folder?.color || '#a0a6b4'; const title = ungrouped ? 'Ungrouped sets' : folder.name; const collapsed = Boolean(folder?.collapsed); group.innerHTML = `<div class="library-folder-head" style="--folder-colour:${color}"><button class="folder-toggle" data-toggle-folder="${folder?.id || ''}" type="button" ${ungrouped ? 'disabled' : ''}><span class="folder-symbol">●</span><span>${escapeHtml(title)}</span><i>${collapsed ? '›' : '⌄'}</i></button>${folderControls(folder, manual)}</div>`; if (!collapsed) sets.forEach(set => { const row = document.createElement('div'); row.className = 'library-set-row'; row.draggable = true; row.dataset.dragSet = set.id; row.innerHTML = `<button class="set-entry ${set.id === state.activeSetId ? 'active' : ''} ${resolvedDeckSubject(set).colour ? 'has-subject' : ''}" ${deckAccentStyle(set)} data-set="${set.id}" type="button"><span>${escapeHtml(set.name)}</span>${deckSubjectDots(set)}<small>${set.cards.length} ${set.cards.length === 1 ? 'card' : 'cards'}</small></button>${setActions(set, manual)}`; group.append(row); }); elements.libraryTree.append(group); });
  if (!elements.libraryTree.children.length) elements.libraryTree.innerHTML = '<p class="library-empty">No sets or folders match that filter.</p>'; applyActiveSubjectAccent(); if (!elements.fullLibrary.hidden) renderFullLibrary();
}
function renderFullLibrary() {
  const filter = elements.fullLibrarySearch.value; const mode = elements.fullLibrarySort.value; const manual = mode === 'manual'; elements.fullLibraryGrid.innerHTML = '';
  libraryGroups(filter, mode).forEach(({ folder, sets, ungrouped }) => { const group = document.createElement('section'); group.className = `full-folder-group ${ungrouped ? 'ungrouped-folder' : ''}`; group.dataset.dropFolder = folder?.id || ''; const color = folder?.color || '#a0a6b4'; const title = ungrouped ? 'Ungrouped sets' : folder.name; const collapsed = Boolean(folder?.collapsed); group.innerHTML = `<div class="full-folder-head" style="--folder-colour:${color}"><button class="folder-toggle" data-toggle-folder="${folder?.id || ''}" type="button" ${ungrouped ? 'disabled' : ''}><span>●</span>${escapeHtml(title)} <i>${collapsed ? '›' : '⌄'}</i></button>${folderControls(folder, manual)}</div>`; if (!collapsed) { const grid = document.createElement('div'); grid.className = 'deck-grid'; sets.forEach(set => { const card = document.createElement('article'); const accent = resolvedDeckSubject(set); card.className = `deck-grid-card ${set.id === state.activeSetId ? 'active' : ''} ${accent.colour ? 'has-subject' : ''}`; if (accent.colour) card.style.setProperty('--subject-accent', accent.colour); card.draggable = true; card.dataset.dragSet = set.id; card.innerHTML = `<button ${deckAccentStyle(set)} data-set="${set.id}" type="button"><span>${escapeHtml(set.name)}</span>${deckSubjectDots(set)}<small>${set.cards.length} ${set.cards.length === 1 ? 'card' : 'cards'}</small></button>${setActions(set, manual)}`; grid.append(card); }); group.append(grid); } elements.fullLibraryGrid.append(group); });
  if (!elements.fullLibraryGrid.children.length) elements.fullLibraryGrid.innerHTML = '<p class="library-empty">No sets or folders match that filter.</p>'; applyActiveSubjectAccent();
}
function openDeckSubjectDialog() { const deck = activeSet(); const subjects = subjectsForDeck(deck); const resolved = resolvedDeckSubject(deck); subjectDialog.hidden = false; subjectDialog.innerHTML = `<section class="library-dialog subject-dialog"><p class="eyebrow">Deck details</p><h3>${escapeHtml(deck.name)}</h3><label>Primary subject<select id="primarySubjectSelect"><option value="">Automatic (${resolved.subject || 'no subject detected'})</option>${subjects.map(subject => `<option value="${escapeHtml(subject)}" ${deck.primarySubject === subject ? 'selected' : ''}>${escapeHtml(subject)}</option>`).join('')}</select></label><p class="subject-dialog-note">Use tags like <b>Biology: Transpiration</b>. The subject before the colon controls deck accents; normal tags stay unchanged.</p>${resolved.fallback ? `<p class="subject-fallback">“${escapeHtml(deck.primarySubject)}” is no longer in this deck. Using ${escapeHtml(resolved.subject || 'the normal deck style')} until you choose another subject.</p>` : ''}<div class="library-dialog-actions"><button class="dialog-cancel" data-subject-action="cancel" type="button">Cancel</button><button class="primary-button" data-subject-action="save-primary" type="button">Save details</button></div></section>`; }
function renderSubjectColours() { const subjects = Array.from(new Set(state.sets.flatMap(subjectsForDeck))).sort((a, b) => a.localeCompare(b)); subjectColoursDialog.hidden = false; subjectColoursDialog.innerHTML = `<section class="library-dialog subject-colours-dialog"><p class="eyebrow">Appearance</p><h3>Subject colours</h3><p class="subject-dialog-note">Colours are local to this app and used as small readable accents. They never change your cards or tags.</p><div class="subject-colour-list">${subjects.length ? subjects.map(subject => { const colour = RecallSubjects.colourForSubject(subject, state.subjectColors); return `<div><strong>${escapeHtml(subject)}</strong><span class="colour-presets">${RecallSubjects.PRESET_COLOURS.map(preset => `<button data-subject-colour="${escapeHtml(subject)}" data-colour="${preset}" type="button" aria-label="Use ${preset} for ${escapeHtml(subject)}" title="Use this colour" style="--colour:${preset}"></button>`).join('')}</span><input data-subject-colour-input="${escapeHtml(subject)}" type="color" value="${colour}" aria-label="Custom colour for ${escapeHtml(subject)}" /></div>`; }).join('') : '<p class="attempts-empty">Add a tag such as “Biology: Cells” to see subject colours here.</p>'}</div><div class="library-dialog-actions"><button class="dialog-cancel" data-subject-colour-action="close" type="button">Done</button></div></section>`; }
function applySubjectColour(subject, colour) { if (!/^#[0-9a-f]{6}$/i.test(colour || '')) return; state.subjectColors[subject] = colour; save(); render(); if (!subjectColoursDialog.hidden) renderSubjectColours(); }
function openTagManager() { renderTagManager(); if (!elements.tagDialog.querySelector('.subject-tag-help')) { const help = document.createElement('p'); help.className = 'subject-tag-help'; help.textContent = 'Tip: write Subject: Topic (for example Biology: Cells) to give decks subject-aware colour accents. Other tags work as normal.'; elements.tagDialogList.before(help); } elements.tagDialog.hidden = false; }
function openCardEditor(id) { const card = activeCards().find(item => item.id === id); if (!card) return; state.editingCardId = id; elements.editFront.value = card.front; elements.editBack.value = card.back; elements.editTags.value = card.tags.join(', '); elements.editHint.value = card.hint; elements.editNotes.value = card.notes; const label = elements.editTags.closest('label'); if (label && !label.querySelector('.subject-tag-help')) { const help = document.createElement('small'); help.className = 'subject-tag-help'; help.textContent = 'Use Subject: Topic for subject colours, e.g. Biology: Cells.'; label.append(help); } elements.cardEditor.hidden = false; setTimeout(() => elements.editFront.focus(), 0); }
deckSubjectButton.addEventListener('click', openDeckSubjectDialog); subjectColoursButton.addEventListener('click', renderSubjectColours);
subjectDialog.addEventListener('click', event => { const action = event.target.dataset.subjectAction; if (action === 'cancel') subjectDialog.hidden = true; if (action === 'save-primary') { activeSet().primarySubject = $('#primarySubjectSelect').value || null; subjectDialog.hidden = true; save(); render(); showToast('Deck subject details saved.'); } if (event.target === subjectDialog) subjectDialog.hidden = true; });
subjectColoursDialog.addEventListener('click', event => { const button = event.target.closest('[data-subject-colour]'); if (button) applySubjectColour(button.dataset.subjectColour, button.dataset.colour); if (event.target.dataset.subjectColourAction === 'close' || event.target === subjectColoursDialog) subjectColoursDialog.hidden = true; });
subjectColoursDialog.addEventListener('input', event => { if (event.target.dataset.subjectColourInput) applySubjectColour(event.target.dataset.subjectColourInput, event.target.value); });
testModeButton.addEventListener('click', openTestSetup);
testMode.addEventListener('input', event => { if (event.target.matches('[data-test-deck], [data-test-folder], [data-test-tag], #testQuestionCount, #testCardFilter')) refreshTestPoolNote(); });
testMode.addEventListener('click', event => { const action = event.target.closest('[data-test-action]')?.dataset.testAction; if (event.target.matches('[data-test-choice]')) { const question = activeTestQuestion(); submitTestAnswer(question.choices[Number(event.target.dataset.testChoice)]); return; } if (action === 'start') startTest(); if (action === 'skip') skipTestQuestion(); if (action === 'next') nextTestQuestion(); if (action === 'exit') { if (confirm('Exit this test? Your unfinished answers will be lost.')) closeTestMode(); } if (action === 'close') closeTestMode(); if (action === 'retry-missed') retryMissedTest(); if (action === 'study-missed') studyMissedTest(); });

function renderAttempts() {
  const set = activeSet();
  const sessions = [...state.sessionHistory, ...(state.currentSession?.attempts ? [{ ...state.currentSession, inProgress: true }] : [])].filter(session => session.deckId === set?.id).reverse();
  const tests = state.testHistory.filter(test => test.questions.some(question => question.deckId === set?.id)).reverse();
  elements.attemptsSubtitle.textContent = `Separate study sessions and tests for ${set?.name || 'this deck'}`;
  const studyEntries = sessions.length ? sessions.map(session => { const accuracy = session.attempts ? Math.round((session.correct / session.attempts) * 100) : 0; return `<article class="attempt-entry"><div><strong>${session.inProgress ? 'Current session' : formatSessionTime(session.endedAt || session.startedAt)}</strong><span>${session.correct} correct · ${session.retry} missed · ${session.learned || 0} learned · ${session.attempts} answered</span><span>${escapeHtml(session.mode === 'typed' ? 'Typed answers' : 'Flip cards')} · ${escapeHtml(session.filter || 'all')} cards</span></div><b>${accuracy}%</b></article>`; }).join('') : '<p class="attempts-empty">No normal study sessions yet.</p>';
  const testEntries = tests.length ? tests.map(test => { const summary = test.summary || RecallTest.scoreTest(test); const mode = test.config?.style === 'choice' ? 'Multiple choice' : test.config?.style === 'mixed' ? 'Mixed test' : 'Typed test'; return `<article class="attempt-entry test-attempt-entry"><div><strong>${formatSessionTime(test.endedAt || test.startedAt)}</strong><span>${summary.correct} correct · ${summary.incorrect} incorrect · ${summary.skipped} skipped · ${summary.total} questions</span><span>${mode}</span></div><b>${summary.percentage}%</b></article>`; }).join('') : '<p class="attempts-empty">No completed tests for this deck.</p>';
  elements.attemptsList.innerHTML = `<section class="attempt-group"><h3>Study sessions</h3>${studyEntries}</section><section class="attempt-group"><h3>Test results</h3>${testEntries}</section>`;
}

// Final Test Mode v2 handlers override the original first-version controls above.
function openTestSetup() {
  clearInterval(testTimer); state.activeTest = null; state.testReviewFilter = 'all'; state.testReviewSearch = ''; testMode.hidden = false;
  testMode.innerHTML = `<div class="test-shell"><header class="test-head"><div><p class="eyebrow">Assessment</p><h1>Build a test.</h1><p>Tests are scored separately and never change your card learning states.</p></div><div class="test-head-actions"><button class="text-button" data-test-action="history" type="button">Test history</button><button class="drawer-close" data-test-action="close" type="button" aria-label="Close test mode">×</button></div></header><div class="test-setup-grid"><section class="test-panel"><h2>Choose material</h2><div class="test-choice-group"><h3>Decks</h3><div class="test-check-list">${testDeckChoices()}</div></div><div class="test-choice-group"><h3>Folders</h3><div class="test-check-list">${testFolderChoices()}</div></div><div class="test-choice-group"><h3>Tags <small>optional</small></h3><div class="test-tags">${testTagChoices()}</div></div></section><section class="test-panel"><h2>Test rules</h2><label class="test-field">Questions<input id="testQuestionCount" type="number" min="1" value="10" /></label><label class="test-field">Include cards<select id="testCardFilter"><option value="all">All cards</option><option value="new">New cards</option><option value="learning">Learning cards</option><option value="mastered">Mastered cards</option><option value="missed">Missed cards</option><option value="flagged">Flagged cards</option></select></label><label class="test-field">Answer style<select id="testAnswerStyle"><option value="typed">Typed answer only</option><option value="choice">Multiple choice only</option><option value="mixed">Mixed mode</option></select></label><label class="test-field">Show first<select id="testPromptSide"><option value="front">First side</option><option value="back">Second side</option></select></label><label class="test-toggle"><span><b>Timed countdown</b><small>Finish before the limit expires.</small></span><input id="testTimed" type="checkbox" checked /></label><label class="test-field test-limit-field">Time limit<select id="testTimeLimit"><option value="300">5 minutes</option><option value="600" selected>10 minutes</option><option value="900">15 minutes</option><option value="1200">20 minutes</option><option value="1800">30 minutes</option><option value="0">No limit — track elapsed</option></select></label><p class="test-pool-note" id="testPoolNote"></p><button class="primary-button test-start" data-test-action="start" type="button">Start test <span>→</span></button></section></div></div>`;
  refreshTestPoolNote();
}
function testSetupConfig() { const deckIds = [...testMode.querySelectorAll('[data-test-deck]:checked')].map(input => input.value); const folderIds = [...testMode.querySelectorAll('[data-test-folder]:checked')].map(input => input.value); state.sets.filter(set => folderIds.includes(set.folderId)).forEach(set => deckIds.push(set.id)); return { deckIds: [...new Set(deckIds)], folderIds, tags: [...testMode.querySelectorAll('[data-test-tag]:checked')].map(input => input.value), count: Number($('#testQuestionCount')?.value) || 0, filter: $('#testCardFilter')?.value || 'all', style: $('#testAnswerStyle')?.value || 'typed', promptSide: $('#testPromptSide')?.value || 'front', timed: Boolean($('#testTimed')?.checked), timeLimitSeconds: Number($('#testTimeLimit')?.value) || 0 }; }
function startTest() { const config = testSetupConfig(); const pool = cardsForTest(config); const questions = RecallTest.selectQuestions(pool, config.count); if (!questions.length) { refreshTestPoolNote(); return showToast('Choose at least one matching card to start a test.'); } if (config.style !== 'typed' && questions.some(question => RecallTest.choicesFor(question, testChoicePool(question), config.promptSide).length < 4)) return showToast('Multiple choice needs four distinct answers. Add more cards or use typed answers.'); const now = Date.now(); state.activeTest = { id: makeId(), version: 2, config, pool, questions: questions.map(card => ({ ...card, answerType: config.style === 'mixed' ? (Math.random() < .5 ? 'typed' : 'choice') : config.style, choices: null })), answers: [], currentIndex: 0, startedAt: new Date(now).toISOString(), deadlineAt: config.timed && config.timeLimitSeconds ? new Date(now + config.timeLimitSeconds * 1000).toISOString() : null, questionStartedAt: now, feedback: null }; renderTestQuestion(); }
function renderTestQuestion() { const test = state.activeTest; const question = activeTestQuestion(); if (!test || !question) return finishTest(); const promptName = test.config.promptSide === 'front' ? question.frontLabel : question.backLabel; const answerName = test.config.promptSide === 'front' ? question.backLabel : question.frontLabel; if (question.answerType === 'choice' && !question.choices) question.choices = RecallTest.choicesFor(question, testChoicePool(question), test.config.promptSide); const feedback = test.feedback; const answered = Boolean(feedback); const input = question.answerType === 'typed' ? `<form class="test-answer-form" id="testTypedForm"><label>Type your answer<input id="testTypedInput" autocomplete="off" autofocus ${answered ? 'disabled' : ''}/></label><button class="primary-button" type="submit" ${answered ? 'disabled' : ''}>Submit <kbd>Enter</kbd></button></form>` : `<div class="test-choices">${question.choices.map((choice, index) => `<button class="test-choice ${answered ? (RecallTest.answersMatch(choice, testAnswerValue(question)) ? 'correct' : feedback.userAnswer === choice ? 'incorrect' : '') : ''}" data-test-choice="${index}" type="button" ${answered ? 'disabled' : ''}><kbd>${index + 1}</kbd><span>${escapeHtml(choice)}</span></button>`).join('')}</div>`; const progress = Math.round((test.currentIndex / test.questions.length) * 100); testMode.innerHTML = `<div class="test-shell test-running"><header class="test-head"><div><p class="eyebrow">${escapeHtml(question.deckName)}</p><h1>Question ${test.currentIndex + 1} <em>of ${test.questions.length}</em></h1><div class="test-progress"><span style="width:${progress}%"></span></div></div><div class="test-running-actions">${testTimerMarkup(test)}<button class="text-button" data-test-action="exit" type="button">Exit test <kbd>Esc</kbd></button></div></header><main class="test-question"><div class="test-question-meta"><span>${escapeHtml(promptName)} · PROMPT</span><span class="card-state ${question.state.toLowerCase()}">${question.state}</span></div><article class="test-card"><p>${escapeHtml(testPromptValue(question))}</p></article><p class="test-answer-label">Answer in <b>${escapeHtml(answerName)}</b></p>${input}${answered ? `<section class="test-feedback ${feedback.result}"><strong>${feedback.result === 'correct' ? 'Correct' : 'Not quite'}</strong><span>Expected answer: <b>${escapeHtml(testAnswerValue(question))}</b></span></section>` : ''}<div class="test-question-footer"><button class="text-button" data-test-action="skip" type="button" ${answered ? 'disabled' : ''}>Skip question</button>${answered ? `<button class="primary-button" data-test-action="next" type="button">${test.currentIndex === test.questions.length - 1 ? 'See results' : 'Next question'} <span>→</span></button>` : ''}</div></main></div>`; clearInterval(testTimer); testTimer = setInterval(updateTestTimer, 250); $('#testTypedForm')?.addEventListener('submit', event => { event.preventDefault(); submitTestAnswer($('#testTypedInput').value); }); updateTestTimer(); }
function finishTest(reason = 'complete') { const test = state.activeTest; if (!test || test.finishedAt) return; clearInterval(testTimer); test.endedAt = new Date().toISOString(); test.finishReason = reason; test.summary = RecallTest.scoreTest(test); test.finishedAt = test.endedAt; state.testHistory.push({ ...test }); state.openTestResultId = test.id; state.activeTest = null; save(); renderTestResults(test); }
function renderTestResults(test) { state.openTestResultId = test.id; const summary = test.summary || RecallTest.scoreTest(test); const items = testReviewRows(test); const misses = RecallTest.missedQuestions({ ...test, answers: RecallTest.reviewItems(test) }); testMode.innerHTML = `<div class="test-shell test-results"><header class="test-head"><div><p class="eyebrow">${test.finishReason === 'time-expired' ? 'Time expired' : 'Test complete'}</p><h1>${summary.percentage}% <em>accuracy</em></h1><p>${summary.correct} correct · ${summary.incorrect} incorrect · ${summary.skipped} skipped · ${summary.unanswered} unanswered</p></div><div class="test-head-actions"><button class="text-button" data-test-action="history" type="button">Test history</button><button class="drawer-close" data-test-action="close" type="button" aria-label="Close results">×</button></div></header><section class="test-score-grid"><div><b>${testFormatDuration(summary.elapsedMs)}</b><span>time taken</span></div><div><b>${testFormatDuration(summary.averageMs)}</b><span>average per question</span></div><div><b>${summary.correct}/${summary.total}</b><span>final score</span></div></section><div class="test-results-grid"><section class="test-panel"><h2>Accuracy by deck</h2><ul class="test-breakdown">${testAccuracyBreakdown(RecallTest.reviewItems(test), 'deck')}</ul><h2>Accuracy by tag</h2><ul class="test-breakdown">${testAccuracyBreakdown(RecallTest.reviewItems(test), 'tag')}</ul></section><section class="test-panel test-full-review"><div class="test-review-head"><h2>Review every question</h2><input id="testReviewSearch" type="search" value="${escapeHtml(state.testReviewSearch)}" placeholder="Search question or answer" /></div><div class="test-review-filters">${['all', 'incorrect', 'skipped', 'unanswered', 'correct'].map(filter => `<button data-test-review-filter="${filter}" type="button" class="${state.testReviewFilter === filter ? 'active' : ''}">${filter === 'all' ? 'All' : filter[0].toUpperCase() + filter.slice(1)}</button>`).join('')}</div><div class="test-missed-list test-review-list">${items.length ? items.map(item => `<article class="test-review-item ${item.result}"><span>${testResultStatus(item)} · ${escapeHtml(item.deckName)} · ${escapeHtml(item.answerType === 'choice' ? 'Multiple choice' : 'Typed')} · ${item.timeMs === null ? '—' : testFormatDuration(item.timeMs)}</span><strong>${escapeHtml(item.prompt)}</strong><p>Your answer: ${escapeHtml(item.userAnswer)}<br/>Expected answer: <b>${escapeHtml(item.correctAnswer)}</b>${item.tags?.length ? `<br/><i>${escapeHtml(item.tags.join(', '))}</i>` : ''}</p></article>`).join('') : '<p class="test-muted">No questions match this filter.</p>'}</div></section></div><footer class="test-results-actions"><button class="text-button" data-test-action="study-missed" type="button" ${misses.length ? '' : 'disabled'}>Study missed cards</button><button class="text-button" data-test-action="retry-all" type="button">Retry all</button><button class="primary-button" data-test-action="retry-missed" type="button" ${misses.length ? '' : 'disabled'}>Retry missed <span>→</span></button><button class="text-button" data-test-action="close" type="button">Return to library</button></footer></div>`; }
function retryMissedTest() { const source = testResultById(state.openTestResultId); if (source) startRetryTest(source, 'missed'); }
function studyMissedTest() { const source = testResultById(state.openTestResultId); const retry = source ? RecallTest.retryQuestions(source, 'missed') : []; const cards = retry.map(question => state.sets.find(set => set.id === question.deckId)?.cards.find(card => card.id === question.id)).filter(Boolean); if (!cards.length) return; state.testStudyContext = new Map(cards.map(card => [card.id, state.sets.find(set => set.cards.includes(card))])); state.activeSetId = studySetForCard(cards[0]).id; state.queue = shuffledCopy(cards); state.currentIndex = 0; state.correct = 0; state.retry = 0; state.history = []; state.flipped = false; state.typedChecked = false; startNewSession(); testMode.hidden = true; render(); document.querySelector('#study').scrollIntoView({ behavior: 'smooth' }); showToast(`Normal study started with ${cards.length} missed card${cards.length === 1 ? '' : 's'} across ${new Set(retry.map(question => question.deckName)).size} deck${new Set(retry.map(question => question.deckName)).size === 1 ? '' : 's'}.`); }
function closeTestMode() { clearInterval(testTimer); state.activeTest = null; testMode.hidden = true; }
function openDeckSubjectDialog() { const deck = activeSet(); const subjects = subjectsForDeck(deck); const resolved = resolvedDeckSubject(deck); subjectDialog.hidden = false; subjectDialog.innerHTML = `<section class="library-dialog subject-dialog"><p class="eyebrow">Deck details</p><h3>${escapeHtml(deck.name)}</h3><label>Deck tags<input id="deckTagsInput" value="${escapeHtml(cleanTags(deck.tags).join(', '))}" placeholder="e.g. Biology: Cells, exam" maxlength="300" /></label><p class="subject-dialog-note">Deck tags organise the whole deck. Use <b>Subject: Topic</b> (for example <b>Biology: Transpiration</b>) to set its subject colour—there is no need to add this tag to every card.</p><label>Primary subject<select id="primarySubjectSelect"><option value="">Automatic (${resolved.subject || 'no subject detected'})</option>${subjects.map(subject => `<option value="${escapeHtml(subject)}" ${deck.primarySubject === subject ? 'selected' : ''}>${escapeHtml(subject)}</option>`).join('')}</select></label>${resolved.fallback ? `<p class="subject-fallback">“${escapeHtml(deck.primarySubject)}” is no longer in this deck. Using ${escapeHtml(resolved.subject || 'the normal deck style')} until you choose another subject.</p>` : ''}<div class="library-dialog-actions"><button class="dialog-cancel" data-subject-action="cancel" type="button">Cancel</button><button class="primary-button" data-subject-action="save-primary" type="button">Save details</button></div></section>`; }
subjectDialog.addEventListener('click', event => { if (event.target.dataset.subjectAction === 'save-primary') { const deck = activeSet(); deck.tags = cleanTags($('#deckTagsInput')?.value); deck.cards.forEach(card => { card.tags = cleanTags([...(card.tags || []), ...deck.tags]); }); save(); render(); showToast(`Deck tags saved to ${deck.cards.length} card${deck.cards.length === 1 ? '' : 's'}.`); } });
