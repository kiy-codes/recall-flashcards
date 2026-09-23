const { app, BrowserWindow } = require('electron');
const path = require('path');

app.setName('Recall Flashcards Smoke Test');
app.setPath('userData', path.join(app.getPath('temp'), `recall-flashcards-smoke-${process.pid}`));

const fail = (message) => { throw new Error(message); };

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // Mirror main.js so exports are checked under the same navigation guards.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  const consoleProblems = [];
  window.webContents.on('console-message', (event) => { const message = event.message || ''; if (/Content Security Policy|Refused to/i.test(message)) consoleProblems.push(message); });
  const downloads = [];
  window.webContents.session.on('will-download', (event, item) => { downloads.push(item.getFilename()); event.preventDefault(); });
  try {
    await window.loadFile(path.join(__dirname, 'index.html'));
    const result = await window.webContents.executeJavaScript(`
      (async () => {
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const click = (selector) => { const node = document.querySelector(selector); assert(node, 'Missing ' + selector); node.click(); return node; };
        await wait(180);

        assert(typeof state !== 'undefined', 'App state is unavailable');
        assert(state.sets.length === 1, 'Default study set was not created');
        click('#settingsBtn');
        assert(!document.querySelector('#settingsMenu').hidden, 'Settings menu did not open');
        document.querySelector('#themeSelect').value = 'dark';
        document.querySelector('#themeSelect').dispatchEvent(new Event('change', { bubbles: true }));
        assert(document.documentElement.dataset.theme === 'dark', 'Dark theme setting did not apply');
        const styleOf = (selector) => getComputedStyle(document.querySelector(selector));
        assert(styleOf('#toast').backgroundColor === 'rgb(36, 54, 95)', 'Dark toast is not using a readable themed surface');
        assert(styleOf('#newSetBtn').backgroundColor === 'rgb(23, 34, 59)', 'Dark library actions are not themed');
        assert(styleOf('.library-search').backgroundColor === 'rgb(23, 34, 59)', 'Dark library search is not themed');
        document.querySelector('#themeSelect').value = 'light';
        document.querySelector('#themeSelect').dispatchEvent(new Event('change', { bubbles: true }));
        assert(document.documentElement.dataset.theme === 'light', 'Light theme setting did not apply');
        document.querySelector('#keybindFlip').dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
        assert(state.keybinds.flip === 'q', 'Custom keybind did not save');
        document.querySelector('#themeSelect').value = 'system';
        document.querySelector('#themeSelect').dispatchEvent(new Event('change', { bubbles: true }));
        click('#resetKeybindsBtn');
        document.body.click();

        document.querySelector('#frontLabelInput').value = 'Question';
        document.querySelector('#backLabelInput').value = 'Answer';
        click('#saveLabelsBtn');
        assert(document.querySelector('#frontSegment').textContent === 'Question', 'Custom first-side name did not save');
        assert(document.querySelector('#backSegment').textContent === 'Answer', 'Custom second-side name did not save');

        document.querySelector('#frontInput').value = 'One';
        document.querySelector('#backInput').value = '1';
        document.querySelector('#addCardForm').requestSubmit();
        assert(state.sets[0].cards.length === 1, 'Manual card creation failed');

        document.querySelector('#importInput').value = 'Two - 2\\nThree - 3';
        document.querySelector('#importFormat').value = 'hyphen';
        click('#importBtn');
        assert(!document.querySelector('#importPreviewDialog').hidden, 'Paste import did not open a preview');
        click('[data-import-action="confirm"]');
        assert(state.sets[0].cards.length === 3, 'Separator import failed');
        assert(getComputedStyle(document.querySelector('#emptyDeck')).display === 'none', 'Empty-deck panel is still visible after cards are added');
        assert(parseList('A\\n1\\nB\\n2', 'lines').length === 2, 'Two-line import preset failed');

        const one = state.sets[0].cards.find(card => card.front === 'One');
        click('[data-edit="' + one.id + '"]');
        document.querySelector('#editTagsInput').value = 'numbers, starter';
        document.querySelector('#editHintInput').value = 'The first counting word';
        document.querySelector('#editNotesInput').value = 'Useful starter context';
        document.querySelector('#cardEditorForm').requestSubmit();
        assert(state.sets[0].tags.includes('numbers') && !Object.hasOwn(one, 'tags') && one.hint && one.notes, 'Deck tags, hint, and notes did not save');
        state.sets[0].tags = ['Biology: Counting']; save(); render();
        click('#deckSubjectBtn');
        document.querySelector('#deckSubjectInput').value = 'Biology';
        document.querySelector('#deckDomainInput').value = 'science';
        document.querySelector('#deckMetadataForm').requestSubmit();
        assert(state.sets[0].primarySubject === 'Biology' && state.sets[0].domain === 'science', 'Deck subject details did not save');
        assert(state.sets[0].tags.includes('Biology: Counting'), 'Deck-level tag did not save');
        assert(state.sets[0].cards.every(card => !Object.hasOwn(card, 'tags')), 'Deck tags should not be copied to cards');
        click('#settingsBtn'); click('#subjectColoursBtn');
        const biologyColour = document.querySelector('[data-subject-colour-input="Biology"]');
        biologyColour.value = '#3c9a88'; biologyColour.dispatchEvent(new Event('input', { bubbles: true }));
        assert(state.subjectColors.Biology === '#3c9a88', 'Subject colour did not save');
        click('[data-subject-colour-action="close"]'); document.body.click();
        assert(document.querySelector('.set-entry').classList.contains('has-subject'), 'Subject library accent was not applied');
        assert(JSON.parse(localStorage.getItem(STORAGE_KEY)).subjectColors.Biology === '#3c9a88', 'Subject colours were not persisted');
        document.querySelector('#librarySort').value = 'subject'; document.querySelector('#librarySort').dispatchEvent(new Event('change', { bubbles: true }));
        assert(document.querySelector('#librarySort').value === 'subject', 'Subject library sort was not available');
        document.querySelector('#librarySort').value = 'manual'; document.querySelector('#librarySort').dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('#deckSearch').value = 'starter context';
        document.querySelector('#deckSearch').dispatchEvent(new Event('input', { bubbles: true }));
        assert(document.querySelector('[data-edit="' + one.id + '"]'), 'Deck search did not find card notes');
        click('#clearSearchBtn');
        document.querySelector('#tagFilterOptions input[value="Biology: Counting"]').checked = true;
        document.querySelector('#tagFilterOptions').dispatchEvent(new Event('change', { bubbles: true }));
        assert(state.selectedTags.includes('Biology: Counting') && state.queue.length === state.sets[0].cards.length, 'Deck tag filter did not combine with study queue');
        state.selectedTags = []; buildQueue();
        click('#selectCardsBtn'); click('[data-select-card="' + one.id + '"]');
        window.prompt = () => 'practice'; click('#bulkTagBtn');
        assert(!Object.hasOwn(one, 'tags'), 'Bulk card tag controls should not add per-card tags');
        state.sets[0].tags = cleanTags([...state.sets[0].tags, 'numbers']);
        renameTag('numbers', 'review'); assert(state.sets[0].tags.includes('review'), 'Deck tag rename failed'); deleteTag('review'); assert(!state.sets[0].tags.includes('review'), 'Deck tag deletion failed');
        click('#bulkDuplicateBtn'); assert(state.sets[0].cards.length === 4, 'Bulk duplicate failed'); click('#selectCardsBtn');
        window.prompt = () => 'fresh tag'; click('#manageTagsBtn'); click('#newTagBtn');
        assert(state.sets[0].tags.includes('fresh tag') && document.querySelector('[data-delete-tag="fresh tag"]'), 'Tag manager did not create a deck tag');
        window.confirm = () => true; click('[data-delete-tag="fresh tag"]'); window.confirm = () => false;
        assert(!state.sets[0].tags.includes('fresh tag'), 'Tag manager did not delete a deck tag'); click('#tagDialogClose');
        assert(findDuplicate({ front: ' one ', back: '1!!!' }) === one, 'Normalised duplicate detection failed');
        assert(parseDelimited('first_side,second_side,tags\\nA,B,"x, y"', ',')[1][2] === 'x, y', 'CSV parser failed quoted fields');
        assert(parseDelimited('first_side\\tsecond_side\\nA\\tB', '\\t').length === 2, 'TSV parser failed');
        assert(csvEscape('=HYPERLINK("http://example.com")', ',') === '"\\'=HYPERLINK(""http://example.com"")"' && csvEscape('@SUM(A1)', ',') === "'@SUM(A1)" && csvEscape('plain', ',') === 'plain', 'CSV export did not neutralise formula-like cells');
        const formulaRoundTrip = rowsToImportDraft(parseDelimited(deckToDelimited({ ...state.sets[0], cards: [{ ...state.sets[0].cards[0], front: '=SUM(A1)', back: '-ing ending' }] }, ','), ','));
        assert(formulaRoundTrip.rows[0].cells[0] === '=SUM(A1)' && formulaRoundTrip.rows[0].cells[1] === '-ing ending', 'CSV export and re-import changed formula-like text');
        openImportPreview([{ front: 'One', back: '1' }, { front: 'Four', back: '4', tags: ['numbers'] }]);
        document.querySelector('#importFlowDuplicates').value = 'skip'; click('[data-import-action="confirm"]');
        assert(state.sets[0].cards.some(card => card.front === 'Four') && state.sets[0].cards.filter(card => card.front === 'One').length === 2, 'Import preview duplicate decision failed');
        state.importDraft = rowsToImportDraft([['Word', 'Translation', 'Gender', 'Part of speech', 'Notes', 'Hint', 'Accepted alternatives', 'Tags'], ['Abiturfeier (f)', 'graduation day', '', 'noun', 'School event', 'Celebration', 'graduation ceremony', 'language, beginner']]);
        renderImportPreview();
        assert(document.querySelector('.import-flow') && document.querySelector('.import-card-table') && document.querySelector('[data-import-map="gender"]'), 'Three-stage import flow did not render its metadata, mapping, and card table controls');
        document.querySelector('#importFlowDestination').value = 'new'; document.querySelector('#importFlowDestination').dispatchEvent(new Event('change', { bubbles: true }));
        const setInput = (selector, value, type = 'input') => { const node = document.querySelector(selector); node.value = value; node.dispatchEvent(new Event(type, { bubbles: true })); };
        setInput('#importFlowDeckName', 'German nouns'); setInput('#importFlowSubject', 'German'); setInput('#importFlowDomain', 'language', 'change'); setInput('#importFlowLanguage', 'de', 'change'); setInput('#importFlowTags', 'language, beginner');
        click('[data-import-action="confirm"]');
        const germanDeck = state.sets.find(set => set.name === 'German nouns'); const importedNoun = germanDeck.cards[0];
        assert(germanDeck.domain === 'language' && germanDeck.language.code === 'de' && germanDeck.tags.includes('language') && !Object.hasOwn(importedNoun, 'tags'), 'New deck import metadata was not saved as deck-level data');
        assert(importedNoun.front === 'Abiturfeier' && importedNoun.wordInfo.gender === 'feminine' && importedNoun.wordInfo.originalMarker === '(f)' && importedNoun.wordInfo.partOfSpeech === 'noun', 'Import did not preserve detected word metadata');
        openSharePreview({ format: 'recall-share-v1', folders: [{ id: 'source-folder', name: 'Shared folder', color: '#2447c2' }], sets: [{ id: 'source-set', name: 'Shared set', folderId: 'source-folder', frontLabel: 'Question', backLabel: 'Answer', cards: [{ front: 'Shared', back: 'Card', tags: ['shared'] }] }] });
        click('[data-import-action="confirm"]');
        assert(state.sets.some(set => set.name === 'Shared set') && state.folders.some(folder => folder.name === 'Shared folder'), 'Shared multi-deck import did not preserve deck and folder data');
        // Share files are untrusted: folder colours are validated and names always render as text.
        const hostile = '<img src=x onerror="window.__injected = true">';
        openSharePreview({ format: 'recall-share-v2', folders: [{ id: 'hostile', name: 'Hostile folder', color: '#123456">' + hostile }], sets: [{ name: 'Hostile ' + hostile, folderId: 'hostile', cards: [{ front: 'x', back: 'y' }] }] });
        click('[data-import-action="confirm"]');
        const hostileFolder = state.folders.find(item => item.name === 'Hostile folder'); const hostileDeck = state.sets.find(set => set.name.startsWith('Hostile'));
        assert(hostileFolder && /^#[0-9a-f]{6}$/i.test(hostileFolder.color), 'Imported folder colour was not validated');
        state.sessionHistory.push({ id: 'hostile-session', deckId: hostileDeck.id, deckName: hostileDeck.name, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), attempts: 1, correct: 1, retry: 0 }); render();
        assert(!document.querySelector('#libraryTree img, #progressChart img, .chart-wrap img') && [...document.querySelectorAll('#progressChart title')].some(title => title.textContent.includes('<img')) && !window.__injected, 'Share-file text was rendered as HTML');
        state.sessionHistory = state.sessionHistory.filter(item => item.id !== 'hostile-session'); deleteSet(hostileDeck.id); deleteFolder(hostileFolder.id);
        // The review screen decides what a share import adds.
        openSharePreview({ format: 'recall-share-v2', folders: [], sets: [{ name: 'Reviewed share', cards: [{ front: 'skip me', back: 'a' }, { front: 'edit me', back: 'b', flagged: true }, { front: 'keep me', back: 'c' }] }] });
        assert(!document.querySelector('#importFlowDestination'), 'Share import showed a destination picker it ignores');
        const includeBox = document.querySelector('[data-import-include]'); includeBox.checked = false; includeBox.dispatchEvent(new Event('change', { bubbles: true }));
        const editBox = document.querySelectorAll('[data-import-edit="front"]')[1]; editBox.value = 'edited'; editBox.dispatchEvent(new Event('change', { bubbles: true }));
        click('[data-import-action="confirm"]');
        const reviewedShare = state.sets.find(set => set.name === 'Reviewed share');
        assert(reviewedShare && reviewedShare.cards.map(card => card.front).join('|') === 'edited|keep me' && reviewedShare.cards[0].flagged, 'Share import ignored the review screen');
        deleteSet(reviewedShare.id);
        // Bulk "Move to" must be able to pick any deck, including the first one listed.
        const movable = state.sets[0].cards.at(-1); click('#selectCardsBtn'); click('[data-select-card="' + movable.id + '"]');
        const moveSelect = document.querySelector('#bulkMoveDeck'); const moveTarget = state.sets.find(set => set.id === moveSelect.options[1]?.value);
        assert(moveSelect.value === '' && moveTarget, 'Move-to menu preselected a deck instead of a placeholder');
        moveSelect.value = moveTarget.id; moveSelect.dispatchEvent(new Event('change', { bubbles: true }));
        assert(moveTarget.cards.includes(movable) && !state.sets[0].cards.includes(movable), 'Bulk move did not move the card');
        moveTarget.cards = moveTarget.cards.filter(card => card !== movable); state.sets[0].cards.push(movable); click('#selectCardsBtn'); save(); buildQueue();
        click('#testModeBtn');
        assert(!document.querySelector('#testMode').hidden, 'Test mode setup did not open');
        document.querySelector('#testQuestionCount').value = '2';
        document.querySelector('#testAnswerStyle').value = 'typed';
        click('[data-test-action="start"]');
        assert(state.activeTest && state.activeTest.questions.length === 2, 'Test mode did not select a unique question set');
        await wait(0);
        assert(document.activeElement?.id === 'testTypedInput', 'Typed Test Mode answer field did not receive focus');
        document.querySelector('#testTypedInput').value = testAnswerValue(activeTestQuestion());
        document.querySelector('#testTypedForm').requestSubmit();
        assert(state.activeTest.feedback.result === 'correct', 'Typed test answer did not use forgiving matching');
        click('[data-test-action="next"]');
        await wait(0);
        assert(document.activeElement?.id === 'testTypedInput', 'Next typed Test Mode question did not refocus the answer field');
        click('[data-test-action="skip"]');
        assert(!state.activeTest && state.testHistory.length === 1, 'Completed test was not saved separately');
        assert(JSON.parse(localStorage.getItem(STORAGE_KEY)).testHistory.every(test => !Object.hasOwn(test, 'pool')), 'Saved tests still store a copy of every card');
        assert(document.querySelector('#testMode').textContent.includes('Review every question'), 'Test results screen did not render complete question review');
        click('[data-test-action="history"]');
        assert(document.querySelector('.test-history-list'), 'Dedicated test history did not open');
        assert(document.querySelector('[data-test-action="open-saved"]'), 'Saved test was missing from history');
        click('[data-test-action="open-saved"]');
        click('[data-test-review-filter="correct"]');
        assert(document.querySelector('#testMode').textContent.includes('Correct'), 'Test result filters did not work');
        click('[data-test-action="history"]');
        window.confirm = () => true; click('[data-test-action="delete-test"]');
        assert(state.testHistory.length === 0, 'Saved test deletion failed');
        window.confirm = () => false;
        click('[data-test-action="close"]');
        click('#testModeBtn');
        document.querySelector('#testQuestionCount').value = '1';
        click('[data-test-action="start"]');
        state.activeTest.deadlineAt = new Date(Date.now() - 1).toISOString();
        updateTestTimer();
        assert(!state.activeTest && state.testHistory.at(-1).finishReason === 'time-expired', 'Timed test did not finish when its countdown expired');
        click('[data-test-action="close"]');
        click('#testModeBtn'); document.querySelector('#testQuestionCount').value = '1'; document.querySelector('#testAnswerStyle').value = 'choice';
        click('[data-test-action="start"]');
        assert(state.activeTest && document.querySelectorAll('[data-test-choice]').length === 4, 'Multiple-choice test did not offer four answers');
        click('[data-test-choice="0"]');
        assert(state.activeTest.feedback && state.activeTest.answers.length === 1, 'Multiple-choice answer was not recorded');
        closeTestMode();

        state.shuffled = false; buildQueue(); click('#revealHintBtn');
        assert(document.querySelector('#hintText').textContent === 'The first counting word', 'Study hint did not reveal without flipping the card');

        const firstText = document.querySelector('#cardContent').textContent;
        click('#flashcard');
        assert(document.querySelector('#cardContent').textContent !== firstText, 'Card flip failed');

        click('#sessionMenuBtn');
        document.querySelector('#sessionShuffle').checked = false;
        document.querySelector('#repeatMissed').checked = true;
        click('#applySessionBtn');
        assert(!state.shuffled && state.repeatMissed, 'Session options were not applied');
        const beforeRetry = state.queue.length;
        click('#retryBtn');
        await wait(300);
        assert(state.queue.length === beforeRetry + 1, 'Repeat-missed option did not queue the card');
        assert(state.retry === 1, 'Retry score did not update');
        assert(state.reviewLog.length === 1 && state.reviewLog[0].outcome === 'retry', 'Retry review event was not recorded');
        const retriedCard = state.sets.flatMap(set => set.cards).find(card => card.id === state.reviewLog[0].cardId);
        assert(state.reviewLog[0].responseTimeMs >= 0 && retriedCard.lastReviewedAt && new Date(retriedCard.dueAt) > new Date(retriedCard.lastReviewedAt), 'Scheduling metadata was not recorded');
        click('#undoBtn');
        assert(state.retry === 0 && state.queue.length === beforeRetry, 'Undo did not restore the session');
        assert(state.reviewLog.length === 0, 'Undo did not remove the review event');

        click('#correctBtn');
        await wait(300);
        assert(state.correct === 1, 'Correct review did not update score');
        assert(state.currentSession.attempts === 1, 'Current session history did not update');
        assert(one.state === 'Learning' && one.correctStreak === 1, 'A reviewed new card did not become Learning');
        assert(one.lastReviewedAt && new Date(one.dueAt) > new Date(one.lastReviewedAt), 'Successful review did not schedule the card forward');
        assert(JSON.parse(localStorage.getItem(STORAGE_KEY)).reviewLog.length === 1, 'Review log was not persisted');
        assert(normaliseCard({ front: 'Legacy', back: 'card' }).state === 'New', 'Existing cards do not migrate to the New state');
        state.shuffled = false; state.studyFilter = 'all'; buildQueue();
        click('#correctBtn'); await wait(300);
        assert(one.state === 'Mastered', 'Learning card did not become Mastered after a second correct answer');
        buildQueue(); click('#retryBtn'); await wait(300);
        assert(one.state === 'Learning' && one.missed && one.correctStreak === 0, 'Incorrect answer did not return card to Learning and mark it missed');
        state.studyFilter = 'missed'; buildQueue();
        assert(state.queue.length === 1 && state.queue[0].id === one.id, 'Missed-card study filter did not limit the session');
        click('#flagBtn'); assert(one.flagged, 'Flagging a card failed');
        state.studyFilter = 'flagged'; buildQueue();
        assert(state.queue.length === 1 && state.queue[0].id === one.id, 'Flagged-card study filter did not limit the session');
        state.studyFilter = 'new'; buildQueue();
        assert(state.queue.every(card => card.state === 'New'), 'New-card study filter included a reviewed card');
        state.studyFilter = 'learning'; buildQueue();
        assert(state.queue.every(card => card.state === 'Learning'), 'Learning-card study filter did not work');
        state.studyFilter = 'due'; buildQueue();
        assert(state.queue.every(card => RecallScheduler.isDue(card)), 'Due-card study filter included a future card');
        state.studyFilter = 'all'; state.studyMode = 'typed'; state.startSide = 'back'; buildQueue();
        document.querySelector('#typedAnswerInput').value = '  one!!! ';
        document.querySelector('#typedAnswerForm').requestSubmit();
        assert(state.typedChecked && state.typedChecked.accepted, 'Typed answer did not accept case and punctuation variations');
        document.querySelector('#typedAnswerForm').requestSubmit(); await wait(300);
        assert(state.currentSession.mode === 'typed' && state.correct === 1, 'Typed answer mode did not record a successful review');
        assert(answersMatch('Abiturfeier', 'Abiturfeier (f)'), 'Bracketed expected text was not optional');
        assert(!answersMatch('Abitur', 'Abiturfeier (f)'), 'Genuinely different typed answer was accepted');
        const activity = state.activity[localDayKey()];
        assert(activity && activity.reviewed > 0 && Object.values(activity.decks).some(deck => deck.name === state.sets[0].name), 'Study activity was not persisted per day and deck');
        assert(studyStreaks().current >= 1 && studyStreaks().longest >= 1, 'Study streak calculation failed');
        assert(document.querySelectorAll('.heatmap-day').length === 112, 'Calendar heatmap did not render all days');
        assert(document.querySelector('#progressChart polyline'), 'Progress chart did not render');
        click('#attemptsTrigger');
        assert(document.querySelector('#attemptsDrawer').classList.contains('open') && document.querySelector('.attempt-entry'), 'Deck attempt history did not open');
        click('#attemptsClose');

        // Completion dialog: its missed-card actions use only this session's retry IDs.
        state.studyMode = 'flip'; state.repeatMissed = false; state.shuffled = false;
        resetStudyRun([one], 'all');
        const historyBeforeCompletion = state.sessionHistory.length;
        click('#retryBtn'); await wait(300);
        assert(!completionDialog.hidden, 'Completion popup did not appear when the queue finished');
        assert(completionDialog.textContent.includes('Reviewed') && completionDialog.textContent.includes('1') && completionDialog.textContent.includes('To revisit'), 'Completion popup summary was incorrect');
        assert(completionDialog.querySelector('[data-completion-action="practice"]') && completionDialog.querySelector('[data-completion-action="test"]'), 'Missed-card actions were hidden after a retry');
        click('[data-completion-action="test"]');
        assert(!testMode.hidden && cardsForTest(testSetupConfig()).length === 1 && cardsForTest(testSetupConfig())[0].id === one.id, 'Test missed cards did not limit Test Mode to the session misses');
        assert(state.sessionHistory.length === historyBeforeCompletion + 1, 'Opening Test Mode did not finish the completed session exactly once');
        closeTestMode(); assert(state.pendingTestCardIds === null, 'Closing Test Mode kept the missed-card filter for the next test');

        resetStudyRun([one], 'all');
        click('#retryBtn'); await wait(300);
        click('[data-completion-action="practice"]');
        assert(state.queue.length === 1 && state.queue[0].id === one.id && state.currentSession.filter === 'session-missed', 'Practice missed cards did not start an isolated missed-card queue');
        click('#correctBtn'); await wait(300);
        assert(!completionDialog.hidden, 'Completion popup did not reopen after practicing missed cards');
        assert(!completionDialog.querySelector('[data-completion-action="practice"]') && !completionDialog.querySelector('[data-completion-action="test"]'), 'Missed-card actions remained visible with no retries');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert(completionDialog.hidden && document.querySelector('#cardPosition').textContent === 'SESSION COMPLETE', 'Escape did not close the completion popup and keep the fallback state');
        openCompletionDialog(); click('[data-completion-action="close"]');
        assert(completionDialog.hidden, 'Close action did not dismiss the completion popup');
        const restartExpected = cardsForStudy().length;
        openCompletionDialog(); click('[data-completion-action="restart"]');
        assert(state.queue.length === restartExpected && state.currentIndex === 0, 'Restart deck did not rebuild the active deck with current session settings');

        const secondCard = state.sets[0].cards.find(card => card.id !== one.id);
        resetStudyRun([one, secondCard], 'all');
        click('#correctBtn'); await wait(300);
        click('#correctBtn'); await wait(300);
        click('[data-completion-action="close"]');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));
        assert(state.currentIndex === 1 && state.correct === 1 && state.history.length === 1, 'One Z keypress undid more than one card');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', repeat: true, bubbles: true }));
        assert(state.currentIndex === 1 && state.correct === 1, 'Holding Z repeated the undo action');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
        assert(state.flipped, 'W did not flip the card once');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', repeat: true, bubbles: true }));
        assert(state.flipped, 'Holding W flipped the card twice');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        assert(!state.flipped, 'ArrowDown did not flip the card once');

        click('#fullscreenBtn');
        await wait(80);
        assert(document.body.classList.contains('focus-study'), 'Fullscreen focus layout did not open');
        click('#exitFocusBtn');
        await wait(80);
        assert(!document.body.classList.contains('focus-study'), 'Fullscreen focus layout did not close');

        click('#libraryTrigger');
        click('#newSetBtn');
        assert(!document.querySelector('#libraryDialog').hidden, 'Add Set dialog did not open');
        document.querySelector('#libraryDialogInput').value = 'Biology';
        click('#libraryDialogSave');
        assert(document.querySelector('#libraryDialog').hidden && getComputedStyle(document.querySelector('#libraryDialog')).display === 'none' && state.sets.some(set => set.name === 'Biology'), 'Add Set did not save and visibly close');
        const biology = state.sets.find(item => item.name === 'Biology');
        click('[data-rename-set="' + biology.id + '"]');
        document.querySelector('#libraryDialogInput').value = 'Life Science';
        click('#libraryDialogSave');
        assert(biology.name === 'Life Science', 'Set rename failed');

        click('#newFolderBtn');
        document.querySelector('#libraryDialogInput').value = 'Science';
        click('#libraryDialogSave');
        assert(state.folders.some(folder => folder.name === 'Science'), 'Add Folder did not save');
        const folder = state.folders.find(item => item.name === 'Science');
        click('[data-rename-folder="' + folder.id + '"]');
        document.querySelector('#libraryDialogInput').value = 'STEM';
        click('#libraryDialogSave');
        assert(folder.name === 'STEM', 'Folder rename failed');
        moveSetToFolder(biology.id, folder.id);
        assert(biology.folderId === folder.id, 'Moving a set into a folder failed');

        const colour = document.querySelector('[data-folder-color="' + folder.id + '"]');
        colour.value = '#bc5b55';
        colour.dispatchEvent(new Event('change', { bubbles: true }));
        assert(folder.color === '#bc5b55', 'Folder colour did not save');

        click('#newSetBtn');
        document.querySelector('#libraryDialogInput').value = 'Chemistry';
        click('#libraryDialogSave');
        const chemistry = state.sets.find(item => item.name === 'Chemistry');
        const ungroupedOrder = () => state.sets.filter(set => !set.folderId).sort((a, b) => a.order - b.order).map(set => set.id);
        const chemistryIndexBefore = ungroupedOrder().indexOf(chemistry.id);
        click('[data-move-set="' + chemistry.id + '"][data-direction="up"]');
        assert(ungroupedOrder().indexOf(chemistry.id) === chemistryIndexBefore - 1, 'Manual set reordering failed');

        click('#newFolderBtn');
        document.querySelector('#libraryDialogInput').value = 'Languages';
        click('#libraryDialogSave');
        const languages = state.folders.find(item => item.name === 'Languages');
        click('[data-move-folder="' + languages.id + '"][data-direction="up"]');
        assert(languages.order < folder.order, 'Manual folder reordering failed');

        click('[data-toggle-folder="' + folder.id + '"]');
        assert(folder.collapsed, 'Folder collapse failed');
        click('[data-toggle-folder="' + folder.id + '"]');
        assert(!folder.collapsed, 'Folder expand failed');
        click('#fullLibraryBtn');
        assert(!document.querySelector('#fullLibrary').hidden && document.querySelector('.deck-grid-card'), 'Full library grid did not open');
        click('#fullLibraryClose');

        document.querySelector('#librarySearch').value = 'life';
        document.querySelector('#librarySearch').dispatchEvent(new Event('input', { bubbles: true }));
        assert(document.querySelector('[data-set="' + biology.id + '"]'), 'Library filtering failed');
        document.querySelector('#librarySort').value = 'name-asc';
        document.querySelector('#librarySort').dispatchEvent(new Event('change', { bubbles: true }));
        deleteSet(chemistry.id);
        assert(!state.sets.some(set => set.id === chemistry.id), 'Deck deletion failed');
        deleteFolder(languages.id);
        assert(!state.folders.some(item => item.id === languages.id), 'Folder deletion failed');

        // Storage stays bounded, and a full disk must not break studying.
        state.reviewLog = Array.from({ length: 2100 }, (_, index) => ({ id: 'log-' + index, cardId: one.id, timestamp: new Date().toISOString(), outcome: 'correct' })); save();
        assert(JSON.parse(localStorage.getItem(STORAGE_KEY)).reviewLog.length === 2000, 'Review log was not capped');
        resetStudyRun([one], 'all'); const realSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
        click('#correctBtn'); await wait(300);
        Storage.prototype.setItem = realSetItem;
        assert(state.correct === 1 && document.querySelector('#progressText').textContent.startsWith('1 /') && document.querySelector('#toast').textContent.includes('could not be saved'), 'A full disk broke the study screen');
        closeCompletionDialog(); save();

        exportDeck(','); exportDeck('\\t'); exportShare();
        await wait(400);

        return 'All automated feature checks passed.';
      })();
    `);
    if (!downloads.some(name => name.endsWith('.csv')) || !downloads.some(name => name.endsWith('.tsv')) || !downloads.includes('recall-decks.recall')) fail(`Exports did not download: ${JSON.stringify(downloads)}`);
    if (consoleProblems.length) fail(`Content Security Policy violations:\n${consoleProblems.join('\n')}`);

    // Saved data that can't be read cleanly must never be deleted.
    const reload = async (seed) => { await window.webContents.executeJavaScript(`localStorage.clear(); ${seed}; true`); await window.loadFile(path.join(__dirname, 'index.html')); await new Promise(resolve => setTimeout(resolve, 200)); };
    await reload(`localStorage.setItem(STORAGE_KEY, JSON.stringify({ sets: [null, { id: 'a', name: 'Biology', cards: [null, { id: 'c1', front: 'cell', back: 'unit of life' }] }], folders: [null], sessionHistory: [null], testHistory: [null], activeSetId: 'a' }))`);
    const tolerant = await window.webContents.executeJavaScript(`state.sets.map(set => set.name + ':' + set.cards.length).join()`);
    if (tolerant !== 'Biology:1') fail(`Null records in saved data lost the library: ${tolerant}`);
    await reload(`localStorage.setItem(STORAGE_KEY, '{"sets": [{"name": "Biology"')`);
    const backups = await window.webContents.executeJavaScript(`Object.keys(localStorage).filter(key => key.startsWith(STORAGE_KEY + '-unreadable-')).map(key => localStorage.getItem(key))`);
    if (backups.length !== 1 || !backups[0].includes('Biology')) fail('Unreadable saved data was not kept as a backup');
    console.log(result);
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
});
