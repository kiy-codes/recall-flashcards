const { app, BrowserWindow } = require('electron');
const path = require('path');

app.setName('Recall Flashcards Smoke Test');
app.setPath('userData', path.join(app.getPath('temp'), `recall-flashcards-smoke-${process.pid}`));

const fail = (message) => { throw new Error(message); };

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
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
        click('#confirmImportBtn');
        assert(state.sets[0].cards.length === 3, 'Separator import failed');
        assert(getComputedStyle(document.querySelector('#emptyDeck')).display === 'none', 'Empty-deck panel is still visible after cards are added');
        assert(parseList('A\\n1\\nB\\n2', 'lines').length === 2, 'Two-line import preset failed');

        const one = state.sets[0].cards.find(card => card.front === 'One');
        click('[data-edit="' + one.id + '"]');
        document.querySelector('#editTagsInput').value = 'numbers, starter';
        document.querySelector('#editHintInput').value = 'The first counting word';
        document.querySelector('#editNotesInput').value = 'Useful starter context';
        document.querySelector('#cardEditorForm').requestSubmit();
        assert(one.tags.includes('numbers') && one.hint && one.notes, 'Card tags, hint, and notes did not save');
        state.sets[0].tags = ['Biology: Counting']; save(); render();
        click('#deckSubjectBtn');
        document.querySelector('#primarySubjectSelect').value = 'Biology';
        click('[data-subject-action="save-primary"]');
        assert(state.sets[0].primarySubject === 'Biology', 'Deck primary subject did not save');
        assert(state.sets[0].tags.includes('Biology: Counting'), 'Deck-level tag did not save');
        assert(state.sets[0].cards.every(card => card.tags.includes('Biology: Counting')), 'Deck tag was not copied to every card');
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
        document.querySelector('#tagFilterOptions input[value="numbers"]').checked = true;
        document.querySelector('#tagFilterOptions').dispatchEvent(new Event('change', { bubbles: true }));
        assert(state.selectedTags.includes('numbers') && state.queue.every(card => card.tags.includes('numbers')), 'Tag filter did not combine with study queue');
        state.selectedTags = []; buildQueue();
        click('#selectCardsBtn'); click('[data-select-card="' + one.id + '"]');
        window.prompt = () => 'practice'; click('#bulkTagBtn');
        assert(one.tags.includes('practice'), 'Bulk tag add failed');
        renameTag('practice', 'review'); assert(one.tags.includes('review'), 'Tag rename failed'); deleteTag('review'); assert(!one.tags.includes('review'), 'Tag deletion failed');
        click('#bulkDuplicateBtn'); assert(state.sets[0].cards.length === 4, 'Bulk duplicate failed'); click('#selectCardsBtn');
        assert(findDuplicate({ front: ' one ', back: '1!!!' }) === one, 'Normalised duplicate detection failed');
        assert(parseDelimited('first_side,second_side,tags\\nA,B,"x, y"', ',')[1][2] === 'x, y', 'CSV parser failed quoted fields');
        assert(parseDelimited('first_side\\tsecond_side\\nA\\tB', '\\t').length === 2, 'TSV parser failed');
        openImportPreview([{ front: 'One', back: '1' }, { front: 'Four', back: '4', tags: ['numbers'] }]);
        document.querySelector('#duplicateMode').value = 'skip'; click('#confirmImportBtn');
        assert(state.sets[0].cards.some(card => card.front === 'Four') && state.sets[0].cards.filter(card => card.front === 'One').length === 2, 'Import preview duplicate decision failed');
        openSharePreview({ format: 'recall-share-v1', folders: [{ id: 'source-folder', name: 'Shared folder', color: '#2447c2' }], sets: [{ id: 'source-set', name: 'Shared set', folderId: 'source-folder', frontLabel: 'Question', backLabel: 'Answer', cards: [{ front: 'Shared', back: 'Card', tags: ['shared'] }] }] });
        document.querySelector('#shareImportMode').value = 'copy'; click('#confirmImportBtn');
        assert(state.sets.some(set => set.name === 'Shared set') && state.folders.some(folder => folder.name === 'Shared folder'), 'Shared multi-deck import did not preserve deck and folder data');
        click('#testModeBtn');
        assert(!document.querySelector('#testMode').hidden, 'Test mode setup did not open');
        document.querySelector('#testQuestionCount').value = '2';
        document.querySelector('#testAnswerStyle').value = 'typed';
        click('[data-test-action="start"]');
        assert(state.activeTest && state.activeTest.questions.length === 2, 'Test mode did not select a unique question set');
        document.querySelector('#testTypedInput').value = testAnswerValue(activeTestQuestion());
        document.querySelector('#testTypedForm').requestSubmit();
        assert(state.activeTest.feedback.result === 'correct', 'Typed test answer did not use forgiving matching');
        click('[data-test-action="next"]');
        click('[data-test-action="skip"]');
        assert(!state.activeTest && state.testHistory.length === 1, 'Completed test was not saved separately');
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
        click('#undoBtn');
        assert(state.retry === 0 && state.queue.length === beforeRetry, 'Undo did not restore the session');

        click('#correctBtn');
        await wait(300);
        assert(state.correct === 1, 'Correct review did not update score');
        assert(state.currentSession.attempts === 1, 'Current session history did not update');
        assert(one.state === 'Learning' && one.correctStreak === 1, 'A reviewed new card did not become Learning');
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
        const defaultSet = state.sets.find(item => item.name === 'My study deck');
        click('[data-move-set="' + chemistry.id + '"][data-direction="up"]');
        assert(chemistry.order < defaultSet.order, 'Manual set reordering failed');

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

        return 'All automated feature checks passed.';
      })();
    `);
    console.log(result);
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
});
