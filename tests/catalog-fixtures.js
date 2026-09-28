const metadata = () => ({ title: 'Public astronomy basics', description: 'A reviewed sample deck.', qualification: 'GCSE', examBoard: 'AQA', subject: 'Physics', topic: 'Space', subtopic: '', version: '1.0.0', verified: false });
const source = () => ({ id: 'private-deck', name: 'Personal astronomy', domain: 'science', folderId: 'private-folder', sync: { owner: 'secret' }, createdAt: 123,
  cards: [{ id: 'private-card', front: 'What is a star?', back: 'A luminous sphere of plasma.', notes: 'Public note', hint: 'Think of the Sun', acceptedAnswers: ['Plasma sphere'],
    wordInfo: { gender: 'unknown', originalMarker: null, partOfSpeech: null, private: 'secret' }, state: 'Mastered', reviewCount: 10, correctStreak: 7, missed: true, flagged: true,
    fsrs: { scheduled_days: 9 }, reviewHistory: ['secret'], dueAt: 'tomorrow', updatedAt: 123, sync: 'secret' }] });
const USER = '11111111-2222-4333-8444-555555555555';
const KEY = '12345678-1234-4234-8234-123456789012';
module.exports = { metadata, source, USER, KEY };
