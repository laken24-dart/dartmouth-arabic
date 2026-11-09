import { motion } from "framer-motion";
import { KEYS, asArray, useStored } from "../lib/storage";
import { ALL_WORDS, LESSONS, shortLessonName } from "../data/vocab";
import { spring } from "./ui";

/** Shared lesson selection (same "ak-sel" key as the classic trainer). */
export function useSelectedLessons() {
  const [selected, setSelected] = useStored(KEYS.selected, ["ab"], asArray);
  const set = new Set(selected);
  const pool = ALL_WORDS.filter(word => set.has(word.lesson));
  return { selected: set, setSelected: next => setSelected([...next]), pool };
}

export default function LessonPicker({ selected, setSelected }) {
  const toggle = key => { const next = new Set(selected); next.has(key) ? next.delete(key) : next.add(key); setSelected(next); };
  return (
    <div className="picker" role="group" aria-label="Lessons to include">
      <span className="mono muted picker-label">Lessons</span>
      {LESSONS.map(lesson => {
        const on = selected.has(lesson.key);
        return (
          <motion.button key={lesson.key} type="button" className="chip" aria-pressed={on} onClick={() => toggle(lesson.key)} whileTap={{ scale: 0.9 }} title={`${lesson.title} · ${lesson.words.length} words`}>
            {on && <motion.span className="chip-fill" layoutId={`chip-fill-${lesson.key}`} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring} />}
            <span>{shortLessonName(lesson.key)}</span>
          </motion.button>
        );
      })}
      <button type="button" className="link" onClick={() => setSelected(new Set(LESSONS.map(lesson => lesson.key)))}>all</button>
      <button type="button" className="link" onClick={() => setSelected(new Set())}>clear</button>
    </div>
  );
}
