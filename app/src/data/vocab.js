import { VOCAB_RAW } from "./vocab-raw.js";

export const LESSONS = [];
let current = null;
VOCAB_RAW.split("\n").forEach(rawLine => {
  const line = rawLine.trim();
  if (!line) return;
  if (line.startsWith("## ")) {
    const [key, title, ar] = line.slice(3).split(" | ");
    current = { key, title, ar, words: [] };
    LESSONS.push(current);
    return;
  }
  const [ar, en] = line.split(" | ");
  if (!current || !ar?.trim() || !en?.trim()) return;
  current.words.push({ id: `${current.key}:${current.words.length}`, ar, en, lesson: current.key });
});

export const ALL_WORDS = LESSONS.flatMap(lesson => lesson.words);
export const LESSON_BY_KEY = Object.fromEntries(LESSONS.map(lesson => [lesson.key, lesson]));
export const shortLessonName = key => (key === "ab" ? "Alif Baa" : `L${key}`);
