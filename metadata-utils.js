(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RecallMetadata = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const GENDERS = ['masculine', 'feminine', 'neuter', 'common', 'unknown', 'not_applicable'];
  const LANGUAGES = [
    { code: 'de', name: 'German' }, { code: 'fr', name: 'French' }, { code: 'el', name: 'Greek' },
    { code: 'es', name: 'Spanish' }, { code: 'la', name: 'Latin' }, { code: 'en', name: 'English' },
  ];
  const DOMAIN_OPTIONS = ['language', 'science', 'history', 'medicine', 'law', 'other'];

  function normaliseDeckTags(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : String(value || '').split(',')).map(tag => String(tag || '').trim()).filter(tag => {
      const key = tag.toLocaleLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true;
    });
  }

  // Legacy cards stored tags individually. Migrate those values once into
  // the owning deck, retaining non-text values as an explicit warning.
  function migrateLegacyCardTags(deckTags, cards) {
    const unresolved = [];
    const legacy = (cards || []).flatMap(card => {
      const value = card?.tags;
      if (Array.isArray(value)) return value.map(tag => { if (typeof tag !== 'string' && tag != null) unresolved.push(tag); return tag; });
      if (typeof value === 'string') return value.split(',');
      if (value != null) unresolved.push(value);
      return [];
    });
    return { tags: normaliseDeckTags([...(deckTags || []), ...legacy.filter(tag => typeof tag === 'string')]), unresolved };
  }

  function normaliseLanguage(value) {
    const candidate = typeof value === 'object' && value ? value : { code: value, name: value };
    const code = String(candidate.code || '').trim().toLocaleLowerCase();
    const known = LANGUAGES.find(item => item.code === code || item.name.toLocaleLowerCase() === String(candidate.name || '').trim().toLocaleLowerCase());
    if (known) return { ...known };
    const name = String(candidate.name || code || '').trim();
    return name ? { code: code || 'custom', name } : null;
  }

  function normaliseDomain(value) {
    const domain = String(value || '').trim().toLocaleLowerCase();
    return DOMAIN_OPTIONS.includes(domain) ? domain : 'other';
  }

  function suggestImportMappings(headers) {
    const labels = (headers || []).map(value => String(value || '').trim().toLocaleLowerCase());
    const find = patterns => labels.findIndex(label => patterns.some(pattern => pattern.test(label)));
    return {
      front: find([/^word$/, /^term$/, /first.?side/, /^front$/, /^question$/, /^prompt$/]),
      back: find([/^definition$/, /^translation$/, /second.?side/, /^back$/, /^answer$/, /^meaning$/]),
      gender: find([/^gender$/, /^article$/, /grammatical.?gender/, /^genus$/]),
      partOfSpeech: find([/part.?of.?speech/, /^pos$/, /^word.?class$/]),
      notes: find([/^notes?$/, /^context$/, /^example$/]),
      hint: find([/^hint$/, /^clue$/]),
      alternatives: find([/alternative/, /accepted.?answer/, /^variants?$/]),
      tags: find([/^deck.?tags?$/, /^tags?$/]),
    };
  }

  function wordInfoFromImport(word, explicitGender, correction = 'auto') {
    const marker = String(explicitGender || '').trim();
    const explicit = genderFromMarker(marker);
    if (correction === 'none') return { cleanWord: String(word || '').trim().replace(/\s*\([^()]*\)\s*$/, '').trim(), wordInfo: { language: null, gender: 'unknown', originalMarker: null, partOfSpeech: null }, warning: null };
    const sourceMarker = String(word || '').match(/\s*(\([^()]*\))\s*$/)?.[1];
    const preferredGender = correction !== 'auto' ? correction : explicit !== 'unknown' ? explicit : 'unknown';
    const extracted = extractWordInfo(word, { gender: preferredGender, originalMarker: explicit !== 'unknown' && marker && !sourceMarker ? marker : null });
    const unknownMarker = sourceMarker && genderFromMarker(sourceMarker) === 'unknown' ? sourceMarker : (marker && explicit === 'unknown' ? marker : null);
    return { ...extracted, warning: unknownMarker ? `Unrecognised gender marker: ${unknownMarker}` : null };
  }

  function genderFromMarker(marker) {
    const text = String(marker || '').trim().toLocaleLowerCase().replace(/[().]/g, '').replace(/\s+/g, ' ');
    if (!text) return 'unknown';
    if (/^(m|masc|masculine|maskulin|masculino|masculin|maskulinum)$/.test(text)) return 'masculine';
    if (/^(f|fem|feminine|féminin|feminin|femininum|femenino|feminina)$/.test(text)) return 'feminine';
    if (/^(n|neut|neuter|neutrum|neutro)$/.test(text)) return 'neuter';
    if (/^(common|común|commun)$/.test(text)) return 'common';
    return 'unknown';
  }

  function extractWordInfo(value, existing = {}) {
    const source = String(value || '').trim();
    const match = source.match(/\s*(\(([^()]*)\))\s*$/);
    const originalMarker = String(existing.originalMarker || match?.[1] || '').trim() || null;
    const inferred = genderFromMarker(existing.gender && existing.gender !== 'unknown' ? existing.gender : originalMarker);
    const gender = GENDERS.includes(existing.gender) && existing.gender !== 'unknown' ? existing.gender : inferred;
    return {
      cleanWord: match && inferred !== 'unknown' ? source.slice(0, match.index).trim() : source,
      wordInfo: {
        language: normaliseLanguage(existing.language) || null,
        gender,
        originalMarker,
        partOfSpeech: String(existing.partOfSpeech || '').trim() || null,
      },
    };
  }

  function normaliseAnswer(value) {
    return String(value || '').replace(/\([^)]*\)/g, ' ').toLocaleLowerCase().trim().replace(/[\p{P}\p{S}_]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  function editDistance(left, right) {
    const a = String(left); const b = String(right); if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 1) return 2;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const next = [i]; let rowMin = next[0];
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        next[j] = Math.min(previous[j] + 1, next[j - 1] + 1, previous[j - 1] + cost);
        rowMin = Math.min(rowMin, next[j]);
      }
      if (rowMin > 1) return 2;
      previous = next;
    }
    return previous[b.length];
  }

  function evaluateTypedAnswer(actual, expected, alternatives = []) {
    const given = normaliseAnswer(actual); const answers = [expected, ...alternatives].map(normaliseAnswer).filter(Boolean);
    if (!given || !answers.length) return { classification: 'incorrect', accepted: false, expected: String(expected || '') };
    if (answers.includes(given)) return { classification: 'exact', accepted: true, expected: String(expected || '') };
    // A one-character vowel substitution is often a different valid word
    // (for example hallo/hello), so keep that case for manual acceptance.
    const likelyTypo = answer => {
      if (answer.length < 4 || editDistance(given, answer) !== 1) return false;
      if (given.length !== answer.length) return true;
      const position = [...given].findIndex((character, index) => character !== answer[index]);
      if (/[^\x00-\x7f]/.test(given[position]) || /[^\x00-\x7f]/.test(answer[position])) return false;
      return !(/[aeiouy]/i.test(given[position]) && /[aeiouy]/i.test(answer[position]));
    };
    const eligible = answers.filter(likelyTypo);
    if (eligible.length === 1) return { classification: 'typo', accepted: true, expected: String(expected || '') };
    return { classification: 'incorrect', accepted: false, expected: String(expected || '') };
  }

  function genderChoices(language) {
    const code = language?.code;
    if (code === 'de') return [{ value: 'masculine', label: 'der' }, { value: 'feminine', label: 'die' }, { value: 'neuter', label: 'das' }];
    if (code === 'fr') return [{ value: 'masculine', label: 'le' }, { value: 'feminine', label: 'la' }];
    if (code === 'es') return [{ value: 'masculine', label: 'el' }, { value: 'feminine', label: 'la' }];
    if (code === 'el') return [{ value: 'masculine', label: 'ο' }, { value: 'feminine', label: 'η' }, { value: 'neuter', label: 'το' }];
    if (code === 'la') return [{ value: 'masculine', label: 'Masculine' }, { value: 'feminine', label: 'Feminine' }, { value: 'neuter', label: 'Neuter' }];
    return [
      { value: 'masculine', label: 'Masculine' }, { value: 'feminine', label: 'Feminine' }, { value: 'neuter', label: 'Neuter' }, { value: 'common', label: 'Common' },
    ];
  }

  function isGenderEligible(card) {
    return card?.domain === 'language' && GENDERS.includes(card?.wordInfo?.gender) && !['unknown', 'not_applicable'].includes(card.wordInfo.gender) && genderChoices(card.language).some(choice => choice.value === card.wordInfo.gender);
  }
  function genderAnswerFor(card) {
    return genderChoices(card?.language).find(choice => choice.value === card?.wordInfo?.gender)?.label || null;
  }

  return { GENDERS, LANGUAGES, DOMAIN_OPTIONS, normaliseDeckTags, migrateLegacyCardTags, normaliseLanguage, normaliseDomain, suggestImportMappings, wordInfoFromImport, genderFromMarker, extractWordInfo, normaliseAnswer, editDistance, evaluateTypedAnswer, genderChoices, isGenderEligible, genderAnswerFor };
});
