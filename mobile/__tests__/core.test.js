import { answersMatch, applyLibraryMutation, applyReview, blankLibrary, filterCards, findDuplicate, importShare, migrateLibrary, normaliseCard, parseDelimited, parsePaste, sessionStats, sharePayload, streaks } from '../src/core';

describe('learning and typed answers', () => {
  test('moves New to Learning then Mastered, and incorrect resets Learning', () => {
    const card = normaliseCard({ front: 'A', back: 'B' });
    applyReview(card, 'correct'); expect(card.state).toBe('Learning');
    applyReview(card, 'correct'); expect(card.state).toBe('Mastered');
    applyReview(card, 'retry'); expect(card).toMatchObject({ state: 'Learning', missed: true, correctStreak: 0 });
  });
  test('accepts optional bracketed answer content only', () => {
    expect(answersMatch('  abiturfeier!!! ', 'Abiturfeier (f)')).toBe(true);
    expect(answersMatch('Abitur', 'Abiturfeier (f)')).toBe(false);
  });
});

describe('filters, duplicates and imports', () => {
  const cards = [normaliseCard({ front: 'One', back: '1', tags: ['numbers'], notes: 'starter' }), normaliseCard({ front: 'Tree', back: 'Baum', tags: ['nature'], flagged: true, state: 'Learning' })];
  test('combines tag and learning filters', () => expect(filterCards(cards, { tags: ['nature'], studyFilter: 'learning' })).toHaveLength(1));
  test('searches notes and detects normalised duplicates', () => { expect(filterCards(cards, { search: 'starter' })[0].front).toBe('One'); expect(findDuplicate(cards, { front: ' one ', back: '1!!!' }).front).toBe('One'); });
  test('parses quoted CSV, TSV and pasted cards', () => { expect(parseDelimited('a,b,tags\nOne,1,"x, y"', ',')[1][2]).toBe('x, y'); expect(parseDelimited('a\tb\nOne\t1', '\t')).toHaveLength(2); expect(parsePaste('Haus - house')).toEqual([{ front: 'Haus', back: 'house' }]); });
});

describe('library sharing and progress', () => {
  test('shares decks without session history and imports a copy with folder', () => {
    const library = blankLibrary(); library.sets[0].name = 'Words'; library.sets[0].cards.push(normaliseCard({ front: 'A', back: 'B' })); library.folders.push({ id: 'folder', name: 'Languages', color: '#2447c2', order: 0 }); library.sets[0].folderId = 'folder'; library.sessions.push({ id: 'private', attempts: 2, correct: 2 });
    const payload = sharePayload(library, [library.sets[0].id]); expect(payload.sessions).toBeUndefined(); expect(payload.sets[0].cards).toHaveLength(1);
    const imported = importShare(blankLibrary(), payload, 'copy', 'skip').library; expect(imported.sets.some(set => set.name === 'Words')).toBe(true); expect(imported.folders.some(folder => folder.name === 'Languages')).toBe(true);
  });
  test('keeps the library when a mutation returns a push() length, an id or a card', () => {
    const library = blankLibrary(); library.sets[0].cards.push(normaliseCard({ id: 'c1', front: 'A', back: 'B' }));
    expect(applyLibraryMutation(library, x => x.sets.push({ ...x.sets[0], id: 'second', name: 'Second' })).sets.map(set => set.name)).toEqual(['My study deck', 'Second']);
    expect(applyLibraryMutation(library, x => x.sets[0].folderId = 'folder').sets[0].folderId).toBe('folder');
    expect(applyLibraryMutation(library, x => Object.assign(x.sets[0].cards[0], { state: 'Learning' })).sets[0].cards[0].state).toBe('Learning');
    expect(library.sets).toHaveLength(1); expect(library.sets[0].cards[0].state).toBe('New');
  });
  test('uses a returned library from share imports', () => { const payload = { format: 'recall-mobile-share-v1', folders: [{ id: 'f', name: 'Shared', color: '"><x' }], sets: [{ name: 'Shared deck', folderId: 'f', cards: [null, { front: 'A', back: 'B' }] }] }; const next = applyLibraryMutation(blankLibrary(), x => importShare(x, payload, 'copy', 'skip').library); expect(next.sets.find(set => set.name === 'Shared deck').cards).toHaveLength(1); expect(next.folders[0].color).toBe('#2447c2'); });
  test('skips null or malformed saved entries instead of failing to load', () => { const migrated = migrateLibrary({ sets: [null, { name: 'Kept', cards: [null, { front: 'A', back: 'B' }] }], folders: [null, { name: 'F', color: 'red' }], sessions: [null, { attempts: 1, correct: 1 }] }); expect(migrated.sets.map(set => set.name)).toEqual(['Kept']); expect(migrated.sets[0].cards).toHaveLength(1); expect(migrated.folders).toHaveLength(1); expect(migrated.folders[0].color).toBe('#2447c2'); expect(migrated.sessions).toHaveLength(1); });
  test('migrates older cards, computes stats and streaks', () => { const migrated = migrateLibrary({ sets: [{ name: 'Old', cards: [{ front: 'A', back: 'B' }] }] }); expect(migrated.sets[0].cards[0].state).toBe('New'); expect(sessionStats([{ attempts: 2, correct: 1 }, { attempts: 2, correct: 2 }])).toMatchObject({ best: 100, change: 50 }); expect(streaks({ '2026-09-19': { reviewed: 1 }, '2026-09-20': { reviewed: 1 } }, new Date('2026-09-20T12:00:00')).current).toBe(2); });
});
