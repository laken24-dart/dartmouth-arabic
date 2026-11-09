// Curriculum engine: ported from the classic curriculum.js so rules and saved progress match exactly.
import { LESSONS } from "../data/vocab";
import { SENTENCES, sentencesForWord, hasSentence } from "../data/sentences";
import { GRAMMAR_BANK } from "../data/grammar";
import { KEYS, read, write } from "./storage";
import { api } from "./api";

export const WORDS_PER_LESSON = 10;
export const PASS_PERCENT = 75;
export const EXAM_LENGTH = 15;

export function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const normalizedWords = unit => (unit?.words || []).filter(word => word.ar?.trim() && word.en?.trim());

/* ---------- persisted state ---------- */
export function loadProgress() {
  const saved = read(KEYS.progress, null);
  const base = { days: [], passedUnits: [], studyDates: [], assessmentScores: [] };
  if (!saved || !Array.isArray(saved.days) || !Array.isArray(saved.passedUnits)) return base;
  return {
    ...saved,
    studyDates: Array.isArray(saved.studyDates) ? saved.studyDates : [],
    assessmentScores: Array.isArray(saved.assessmentScores) ? saved.assessmentScores : []
  };
}
export const saveProgress = progress => write(KEYS.progress, progress);

const loadSet = key => { const value = read(key, []); return new Set(Array.isArray(value) ? value : []); };

/* ---------- roadmap structure ---------- */
export function unitDays(unit) {
  const lessonCount = Math.max(1, Math.ceil(normalizedWords(unit).length / WORDS_PER_LESSON));
  return Array.from({ length: lessonCount * 2 }, (_, index) => ({
    id: `${unit.key}:day:${index + 1}`,
    number: index + 1,
    kind: index % 2 === 0 ? "lesson" : "homework",
    title: index % 2 === 0 ? `Lesson ${Math.floor(index / 2) + 1}` : `Homework ${Math.ceil(index / 2)}`
  }));
}
export const completedDays = (unit, progress) => unitDays(unit).filter(day => progress.days.includes(day.id)).length;
export const activeDay = (unit, progress) => unitDays(unit).find(day => !progress.days.includes(day.id)) || null;

export function currentUnitIndex(progress) {
  const placementIndex = LESSONS.findIndex(unit => unit.key === progress.placementStartUnit);
  let index = Math.max(0, placementIndex);
  while (index < LESSONS.length - 1 && progress.passedUnits.includes(LESSONS[index].key)) index++;
  return index;
}

export function overallPercent(progress) {
  const total = LESSONS.reduce((sum, unit) => sum + unitDays(unit).length, 0);
  const done = LESSONS.reduce((sum, unit) => sum + completedDays(unit, progress), 0);
  return total ? Math.round((done + progress.passedUnits.length * 0.6) / (total + LESSONS.length * 0.6) * 100) : 0;
}

export function dayWords(unit, day) {
  const lessonIndex = Math.floor((day.number - 1) / 2);
  return normalizedWords(unit).slice(lessonIndex * WORDS_PER_LESSON, (lessonIndex + 1) * WORDS_PER_LESSON);
}

export function recordStudyDay(progress) {
  const today = new Date().toISOString().slice(0, 10);
  return progress.studyDates.includes(today) ? progress : { ...progress, studyDates: [...progress.studyDates, today] };
}

/* ---------- questions ---------- */
export function createMeaningQuestion(unit, word, dayNumber) {
  const pool = normalizedWords(unit).filter(candidate => candidate.id !== word.id && candidate.en !== word.en);
  if (pool.length < 3) return null;
  const targetTerm = shuffle(word.en.split("/").map(value => value.trim()).filter(Boolean))[0] || word.en;
  const meaningWord = { ...word, en: targetTerm };
  const distractors = shuffle(pool).slice(0, 3).map(candidate => ({ ...candidate, en: candidate.en.split("/")[0].trim() }));
  const options = shuffle([meaningWord, ...distractors]);
  return { id: `meaning:${unit.key}:${dayNumber}:${word.id}`, kind: "meaning", word: meaningWord, originalWord: word, options, prompt: word.ar };
}

/** Arabic sentence with one blank; four same-part-of-speech choices, never two that could both fit. */
export function createSentenceQuestion(word, pool) {
  const entries = sentencesForWord(word);
  if (!entries.length) return null;
  const usedIds = loadSet(KEYS.used); // re-read each time: the signed-in account may have changed
  const fresh = entries.filter(entry => !usedIds.has(`sentence:${entry.index}`));
  const entry = shuffle(fresh.length ? fresh : entries)[0];
  const id = `sentence:${entry.index}`;
  usedIds.add(id);
  write(KEYS.used, [...usedIds]);
  const seen = new Set(pool.map(candidate => candidate.ar));
  const usable = candidate => candidate.group !== entry.group && candidate.answer !== entry.answer && candidate.key !== entry.key;
  const tiers = [
    SENTENCES.filter(c => usable(c) && c.pos === entry.pos && seen.has(c.key)),
    SENTENCES.filter(c => usable(c) && c.pos === entry.pos),
    SENTENCES.filter(c => usable(c) && seen.has(c.key)),
    SENTENCES.filter(usable)
  ];
  const distractors = [];
  for (const tier of tiers) {
    for (const candidate of shuffle(tier)) {
      if (distractors.length >= 3) break;
      if (distractors.some(item => item.answer === candidate.answer || item.group === candidate.group)) continue;
      distractors.push(candidate);
    }
  }
  const options = shuffle([
    { id: word.id, ar: entry.answer, correct: true },
    ...distractors.map(candidate => ({ id: `sentence-option:${candidate.index}`, ar: candidate.answer, correct: false }))
  ]);
  return { id, kind: "sentence", word: { ...word, ar: entry.answer, headword: word.ar }, options, prompt: entry.sentence, translation: entry.translation };
}

export function buildSentenceQuestions(unit, day, words) {
  const unitWords = normalizedWords(unit);
  const lessonIndex = Math.floor((day.number - 1) / 2);
  const taught = unitWords.slice(0, (lessonIndex + 1) * WORDS_PER_LESSON);
  const position = LESSONS.findIndex(item => item.key === unit.key);
  const earlier = LESSONS.slice(0, Math.max(0, position)).flatMap(normalizedWords);
  const pool = [...earlier, ...taught];
  const batch = new Set(words.map(word => word.id));
  const ordered = [...shuffle(words), ...shuffle(taught.filter(word => !batch.has(word.id))), ...shuffle(earlier)].filter(hasSentence);
  const questions = [];
  const usedKeys = new Set();
  for (const word of ordered) {
    if (questions.length >= Math.min(words.length, WORDS_PER_LESSON)) break;
    if (usedKeys.has(word.ar)) continue;
    const question = createSentenceQuestion(word, pool);
    if (question) { questions.push(question); usedKeys.add(word.ar); }
  }
  return questions;
}

export function makeAssessment(unit, { allCourse = false } = {}) {
  const index = LESSONS.findIndex(item => item.key === unit.key);
  const words = allCourse ? LESSONS.flatMap(normalizedWords) : LESSONS.slice(0, index + 1).flatMap(normalizedWords);
  const assessedWords = loadSet(KEYS.assessedWords);
  const assessedGrammar = loadSet(KEYS.assessedGrammar);
  const grammarCount = Math.min(3, GRAMMAR_BANK.length);
  const vocabCount = EXAM_LENGTH - grammarCount;
  const sentenceWords = words.filter(hasSentence);
  const ordered = [...shuffle(sentenceWords.filter(w => !assessedWords.has(w.id))), ...shuffle(sentenceWords.filter(w => assessedWords.has(w.id)))];
  const vocab = [];
  const usedKeys = new Set();
  for (const word of ordered) {
    if (vocab.length >= vocabCount) break;
    if (usedKeys.has(word.ar)) continue;
    const question = createSentenceQuestion(word, words);
    if (question) { vocab.push(question); usedKeys.add(word.ar); }
  }
  const grammar = [...shuffle(GRAMMAR_BANK.filter(item => !assessedGrammar.has(item.id))), ...shuffle(GRAMMAR_BANK.filter(item => assessedGrammar.has(item.id)))]
    .slice(0, grammarCount)
    .map(item => {
      const options = shuffle(item.options.map((text, original) => ({ id: `${item.id}:${original}`, text, correct: original === item.answer })));
      return { id: `grammar:${unit.key}:${item.id}`, kind: "grammar", coverageId: item.id, prompt: item.prompt, options, explain: item.explain };
    });
  return shuffle([...vocab, ...grammar]).slice(0, EXAM_LENGTH);
}

export function markAssessed(question) {
  if (question.kind === "sentence") {
    const set = loadSet(KEYS.assessedWords); set.add(question.word.id); write(KEYS.assessedWords, [...set]);
  } else if (question.kind === "grammar") {
    const set = loadSet(KEYS.assessedGrammar); set.add(question.coverageId); write(KEYS.assessedGrammar, [...set]);
  }
}

/* ---------- spaced review ---------- */
export const loadReview = () => { const value = read(KEYS.review, []); return Array.isArray(value) ? value : []; };

export function recordMiss(question, unit) {
  const queue = loadReview();
  const id = question.id;
  const existing = queue.find(item => item.id === id);
  const item = existing || { id, repetitions: 0, intervalDays: 0, ease: 2.3, misses: 0 };
  const isMeaning = question.kind === "meaning";
  const isSentence = question.kind === "sentence";
  const correct = question.options.find(option => option.correct || option.id === question.word?.id);
  Object.assign(item, {
    kind: isMeaning ? "meaning" : isSentence ? "vocab" : "grammar",
    unitKey: unit.key,
    unitTitle: unit.title,
    prompt: question.prompt,
    options: question.options.map(option => (isMeaning ? option.en : option.ar ?? option.text)),
    correctLabel: isMeaning ? question.word.en : isSentence ? question.word.ar : correct?.text,
    audioText: question.originalWord?.ar || (isSentence ? question.word.ar : ""),
    explanation: isMeaning
      ? `${question.originalWord.ar} means “${question.originalWord.en}.”`
      : isSentence ? `${question.word.ar} means “${question.word.en}.” — ${question.translation}` : question.explain,
    direction: isMeaning || !isSentence ? "ltr" : "rtl",
    promptDir: isSentence || isMeaning ? "rtl" : "ltr",
    dueAt: Date.now(),
    lastMissedAt: Date.now(),
    misses: item.misses + 1
  });
  if (!existing) queue.push(item);
  write(KEYS.review, queue);
}

export function scheduleReview(id, rating) {
  const queue = loadReview();
  const item = queue.find(entry => entry.id === id);
  if (!item) return;
  if (rating === "again") { item.repetitions = 0; item.intervalDays = 1; }
  else {
    item.repetitions += 1;
    const base = item.repetitions === 1 ? 1 : item.repetitions === 2 ? 3 : item.repetitions === 3 ? 7 : Math.min(60, Math.round(item.intervalDays * item.ease));
    item.intervalDays = rating === "hard" ? Math.max(1, Math.round(base * 0.7)) : rating === "easy" ? Math.min(90, Math.round(base * 1.5)) : base;
    if (rating === "hard") item.ease = Math.max(1.3, item.ease - 0.15);
    if (rating === "easy") item.ease = Math.min(3.0, item.ease + 0.15);
  }
  item.dueAt = Date.now() + item.intervalDays * 86400000;
  item.lastReviewedAt = Date.now();
  write(KEYS.review, queue);
}

/* ---------- classroom bridge (server) ---------- */

/** Instructor lesson plan / homework assigned to this day for any class the learner has joined. */
export async function fetchClasswork(unit, day) {
  try { return await api(`/classwork?unit=${encodeURIComponent(unit.key)}&day=${day.number}`); }
  catch { return { lesson: null, homework: null }; }
}
