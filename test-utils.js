(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RecallTest = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const normaliseAnswer = value => String(value || '').replace(/\([^)]*\)/g, ' ').toLocaleLowerCase().trim().replace(/[\p{P}\p{S}_]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const answersMatch = (actual, expected) => normaliseAnswer(actual) === normaliseAnswer(expected);
  const shuffled = items => { const result = [...items]; for (let index = result.length - 1; index > 0; index -= 1) { const target = Math.floor(Math.random() * (index + 1)); [result[index], result[target]] = [result[target], result[index]]; } return result; };
  const selectQuestions = (cards, count) => shuffled(cards).slice(0, Math.max(0, Math.min(Number(count) || 0, cards.length)));
  const choicesFor = (question, pool, promptSide) => {
    const answerSide = promptSide === 'front' ? 'back' : 'front';
    const correct = question[answerSide]; const seen = new Set([normaliseAnswer(correct)]);
    const distractors = shuffled(pool.filter(card => card.id !== question.id)).map(card => card[answerSide]).filter(answer => {
      const key = normaliseAnswer(answer); if (!key || seen.has(key)) return false; seen.add(key); return true;
    }).slice(0, 3);
    return shuffled([correct, ...distractors]);
  };
  const scoreTest = attempt => {
    const answers = attempt.answers || []; const total = attempt.questions?.length || 0;
    const correct = answers.filter(answer => answer.result === 'correct').length;
    const skipped = answers.filter(answer => answer.result === 'skipped').length;
    const answered = answers.filter(answer => answer.result === 'correct' || answer.result === 'incorrect').length;
    const elapsedMs = Math.max(0, new Date(attempt.endedAt || Date.now()) - new Date(attempt.startedAt || Date.now()));
    return { total, correct, incorrect: answers.filter(answer => answer.result === 'incorrect').length, skipped, unanswered: Math.max(0, total - answered - skipped), percentage: total ? Math.round(correct / total * 100) : 0, elapsedMs, averageMs: answered || skipped ? Math.round(elapsedMs / (answered + skipped)) : 0 };
  };
  const missedQuestions = attempt => (attempt.answers || []).filter(answer => answer.result !== 'correct');
  const reviewItems = attempt => (attempt.questions || []).map(question => {
    const answer = (attempt.answers || []).find(item => item.questionId === question.id && item.deckId === question.deckId);
    const promptSide = attempt.config?.promptSide || 'front';
    const expected = promptSide === 'front' ? question.back : question.front;
    const prompt = promptSide === 'front' ? question.front : question.back;
    return answer || { questionId: question.id, deckId: question.deckId, deckName: question.deckName, tags: question.tags || [], prompt, correctAnswer: expected, userAnswer: '—', answerType: question.answerType || attempt.config?.style || 'typed', result: 'unanswered', timeMs: null };
  });
  const remainingMs = (attempt, now = Date.now()) => attempt?.deadlineAt ? Math.max(0, new Date(attempt.deadlineAt).getTime() - now) : null;
  const isExpired = (attempt, now = Date.now()) => remainingMs(attempt, now) === 0 && Boolean(attempt?.deadlineAt);
  const retryQuestions = (attempt, mode = 'missed') => {
    const items = reviewItems(attempt); const selected = mode === 'all' ? items : items.filter(item => item.result !== 'correct');
    const ids = new Set(selected.map(item => `${item.deckId}:${item.questionId}`)); return (attempt.questions || []).filter(question => ids.has(`${question.deckId}:${question.id}`));
  };
  const filterHistory = (attempts, filters = {}, now = Date.now()) => attempts.filter(attempt => {
    const summary = attempt.summary || scoreTest(attempt); const started = new Date(attempt.startedAt).getTime(); const deckMatches = !filters.deckId || attempt.questions?.some(question => question.deckId === filters.deckId);
    const folderMatches = !filters.folderId || attempt.questions?.some(question => question.folderId === filters.folderId);
    const ageDays = filters.days ? (now - started) / 86400000 : 0; const dateMatches = !filters.days || ageDays <= Number(filters.days);
    const scoreMatches = !filters.score || (filters.score === 'perfect' ? summary.percentage === 100 : filters.score === '80plus' ? summary.percentage >= 80 : summary.percentage < 80);
    return deckMatches && folderMatches && dateMatches && scoreMatches;
  });
  return { normaliseAnswer, answersMatch, shuffled, selectQuestions, choicesFor, scoreTest, missedQuestions, reviewItems, remainingMs, isExpired, retryQuestions, filterHistory };
});
