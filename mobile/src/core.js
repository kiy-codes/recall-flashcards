export const STORAGE_KEY = 'recall-mobile-v1';
export const CARD_STATES = ['New', 'Learning', 'Mastered'];

export const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
export const cleanTags = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(',')).map(tag => String(tag).trim()).filter(Boolean))];
export const normaliseAnswer = value => String(value || '').replace(/\([^)]*\)/g, ' ').toLocaleLowerCase().trim().replace(/[\p{P}\p{S}_]+/gu, ' ').replace(/\s+/g, ' ').trim();
export const answersMatch = (actual, expected) => normaliseAnswer(actual) === normaliseAnswer(expected);
export const cardKey = card => `${normaliseAnswer(card.front)}\u0000${normaliseAnswer(card.back)}`;
const objects = list => Array.isArray(list) ? list.filter(item => item && typeof item === 'object') : [];
export const safeColour = (value, fallback = '#2447c2') => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;

// Mutations edit a copy in place. Their return value only replaces the library when
// it is a whole library, so one-liners such as `x => x.sets.push(...)` stay safe.
export function applyLibraryMutation(library, mutate) {
  const draft = JSON.parse(JSON.stringify(library));
  const result = mutate(draft);
  return result && typeof result === 'object' && Array.isArray(result.sets) ? result : draft;
}

export function normaliseCard(card = {}) {
  return { id: card.id || id(), front: String(card.front || ''), back: String(card.back || ''), tags: cleanTags(card.tags), notes: String(card.notes || ''), hint: String(card.hint || ''), flagged: Boolean(card.flagged), state: CARD_STATES.includes(card.state) ? card.state : 'New', missed: Boolean(card.missed), correctStreak: Number(card.correctStreak) || 0, reviewCount: Number(card.reviewCount) || 0 };
}
export function blankLibrary() {
  const set = { id: id(), name: 'My study deck', folderId: null, frontLabel: 'First side', backLabel: 'Second side', order: 0, cards: [] };
  return { version: 3, sets: [set], folders: [], activeSetId: set.id, sessions: [], activity: {} };
}
export function migrateLibrary(raw) {
  const base = raw && typeof raw === 'object' ? raw : blankLibrary();
  const sourceSets = objects(base.sets);
  const sets = sourceSets.length ? sourceSets.map((set, index) => ({ id: set.id || id(), name: set.name || `Study set ${index + 1}`, folderId: set.folderId || null, frontLabel: set.frontLabel || 'First side', backLabel: set.backLabel || 'Second side', order: Number.isFinite(set.order) ? set.order : index, cards: objects(set.cards).map(normaliseCard) })) : blankLibrary().sets;
  return { version: 3, sets, folders: objects(base.folders).map((folder, index) => ({ id: folder.id || id(), name: folder.name || `Folder ${index + 1}`, color: safeColour(folder.color), order: Number.isFinite(folder.order) ? folder.order : index, collapsed: Boolean(folder.collapsed) })), activeSetId: sets.some(set => set.id === base.activeSetId) ? base.activeSetId : sets[0].id, sessions: objects(base.sessions || base.sessionHistory).map(session => ({ ...session, id: session.id || id(), learned: session.learned || 0 })), activity: base.activity && typeof base.activity === 'object' ? base.activity : {} };
}
export const activeSet = library => library.sets.find(set => set.id === library.activeSetId) || library.sets[0];
export const findDuplicate = (cards, card, ignoreId) => cards.find(item => item.id !== ignoreId && cardKey(item) === cardKey(card));
export function filterCards(cards, { studyFilter = 'all', tags = [], search = '' } = {}) {
  const term = String(search).toLocaleLowerCase().trim();
  return cards.filter(card => (!tags.length || tags.every(tag => card.tags.includes(tag))) && (!term || [card.front, card.back, card.notes, card.hint, ...card.tags].join(' ').toLocaleLowerCase().includes(term)) && (studyFilter === 'all' || studyFilter === 'flagged' && card.flagged || studyFilter === 'missed' && card.missed || studyFilter === 'new' && card.state === 'New' || studyFilter === 'learning' && card.state === 'Learning'));
}
export function applyReview(card, result) {
  const before = { state: card.state, missed: card.missed, correctStreak: card.correctStreak, reviewCount: card.reviewCount }; card.reviewCount += 1; let learned = false;
  if (result === 'correct') { if (card.state === 'New') card.state = 'Learning'; card.correctStreak += 1; card.missed = false; if (card.state === 'Learning' && card.correctStreak >= 2) { learned = card.state !== 'Mastered'; card.state = 'Mastered'; } } else { card.state = 'Learning'; card.missed = true; card.correctStreak = 0; }
  return { before, learned };
}
export const dateKey = (value = new Date()) => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function recordActivity(activity, set, learned, now = new Date()) { const day = dateKey(now); const entry = activity[day] ||= { reviewed: 0, learned: 0, decks: {} }; entry.reviewed += 1; entry.learned += learned ? 1 : 0; const deck = entry.decks[set.id] ||= { name: set.name, reviewed: 0, learned: 0 }; deck.reviewed += 1; deck.learned += learned ? 1 : 0; return day; }
export function streaks(activity, now = new Date()) { const days = new Set(Object.entries(activity).filter(([, value]) => value.reviewed).map(([key]) => key)); const previous = key => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() - 1); return dateKey(d); }; let cursor = dateKey(now); if (!days.has(cursor)) cursor = previous(cursor); let current = 0; while (days.has(cursor)) { current += 1; cursor = previous(cursor); } const sorted = [...days].sort(); let longest = 0; let run = 0; let prior; sorted.forEach(day => { run = prior && previous(day) === prior ? run + 1 : 1; longest = Math.max(longest, run); prior = day; }); return { current, longest }; }
export function sessionStats(sessions) { const rates = sessions.filter(session => session.attempts).map(session => session.correct / session.attempts * 100); return { best: rates.length ? Math.round(Math.max(...rates)) : 0, change: rates.length > 1 ? Math.round(rates.at(-1) - rates[0]) : 0 }; }
export function parseDelimited(text, delimiter) { const rows = []; let row = []; let cell = ''; let quoted = false; for (let i = 0; i < text.length; i += 1) { const char = text[i]; if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === delimiter && !quoted) { row.push(cell); cell = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = ''; } else cell += char; } row.push(cell); if (row.some(value => value.trim())) rows.push(row); return rows; }
export function parsePaste(text) { return text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean).map(line => { const found = line.match(/^(.*?)(?:\t|\s[-—–→|]\s|:\s+)(.+)$/); return found ? { front: found[1].trim(), back: found[2].trim() } : null; }).filter(Boolean); }
export const sharePayload = (library, setIds) => { const sets = library.sets.filter(set => setIds.includes(set.id)); const folders = library.folders.filter(folder => sets.some(set => set.folderId === folder.id)); return { format: 'recall-mobile-share-v1', exportedAt: new Date().toISOString(), folders, sets: sets.map(set => ({ ...set, cards: set.cards.map(normaliseCard) })) }; };
export function importShare(library, payload, mode = 'merge', duplicateMode = 'skip') { const next = migrateLibrary(library); if (!payload || payload.format !== 'recall-mobile-share-v1') return { library: next, imported: 0 }; const folders = new Map(next.folders.map(folder => [folder.name, folder])); let imported = 0; objects(payload.sets).forEach(source => { let target = next.sets.find(set => set.name === source.name); if (mode === 'skip' && target) return; if (mode === 'copy' || !target) { target = { ...source, id: id(), name: mode === 'copy' && next.sets.some(set => set.name === source.name) ? `${source.name} copy` : source.name, cards: [], order: next.sets.length }; const sourceFolder = objects(payload.folders).find(folder => folder.id === source.folderId); if (sourceFolder) { let folder = folders.get(sourceFolder.name); if (!folder) { folder = { ...sourceFolder, id: id(), color: safeColour(sourceFolder.color), order: next.folders.length }; next.folders.push(folder); folders.set(folder.name, folder); } target.folderId = folder.id; } next.sets.push(target); }
    objects(source.cards).map(normaliseCard).forEach(card => { const existing = findDuplicate(target.cards, card); if (existing && duplicateMode === 'skip') return; if (existing && duplicateMode === 'replace') Object.assign(existing, { ...card, id: existing.id }); else target.cards.push(card); imported += 1; });
  }); return { library: next, imported }; }
