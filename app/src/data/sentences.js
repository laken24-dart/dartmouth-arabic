// Arabic fill-in-the-blank sentences live in ./sentence-bank.js (format explained at the top of that file).
import { SENTENCE_BANK } from "./sentence-bank";

export const SENTENCES = SENTENCE_BANK.map(([key, sentence, answer, pos, group, translation, unitKey], index) => ({
  index,
  key,
  sentence,
  answer,
  pos,
  group: group || `solo:${index}`,
  translation,
  unitKey: unitKey || null
}));

export function sentencesForWord(word) {
  return SENTENCES.filter(entry => entry.key === word.ar && (!entry.unitKey || entry.unitKey === word.lesson));
}

export const hasSentence = word => sentencesForWord(word).length > 0;
