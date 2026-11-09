import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { KEYS, asArray, useStored } from "../lib/storage";
import { LESSONS } from "../data/vocab";
import LessonPicker, { useSelectedLessons } from "../components/LessonPicker";
import { Ar, Counter, RiseText, SpeakButton, spring } from "../components/ui";

const stripMarks = text => text.replace(/[ً-ْٰ]/g, "");

function StarButton({ on, onToggle }) {
  const [burst, setBurst] = useState(0);
  return (
    <motion.button type="button" className={`star${on ? " on" : ""}`} aria-pressed={on} aria-label={on ? "Unmark as known" : "Mark as known"} whileTap={{ scale: 0.8 }}
      onClick={() => { if (!on) setBurst(Date.now()); onToggle(); }}>
      <motion.span animate={on ? { scale: [1, 1.5, 1], rotate: [0, 72, 72] } : { scale: 1, rotate: 0 }} transition={{ duration: 0.45 }}>★</motion.span>
      <AnimatePresence>
        {burst > 0 && on && [0, 1, 2, 3, 4, 5].map(index => (
          <motion.i key={`${burst}-${index}`} className="star-spark" initial={{ opacity: 1, x: 0, y: 0 }} animate={{ opacity: 0, x: Math.cos(index * 1.047) * 22, y: Math.sin(index * 1.047) * 22 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} />
        ))}
      </AnimatePresence>
    </motion.button>
  );
}

export default function Words() {
  const { selected, setSelected, pool } = useSelectedLessons();
  const [known, setKnown] = useStored(KEYS.known, [], asArray);
  const knownSet = new Set(known);
  const [query, setQuery] = useState("");
  const [hideKnown, setHideKnown] = useState(false);
  const toggleKnown = id => setKnown(list => (list.includes(id) ? list.filter(item => item !== id) : [...list, id]));

  const groups = useMemo(() => {
    const needle = stripMarks(query.trim().toLowerCase());
    return LESSONS.filter(lesson => selected.has(lesson.key)).map(lesson => ({
      lesson,
      words: lesson.words.filter(word => (!hideKnown || !knownSet.has(word.id)) && (!needle || word.en.toLowerCase().includes(needle) || stripMarks(word.ar).includes(needle)))
    })).filter(group => group.words.length);
  }, [selected, query, hideKnown, known]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page words">
      <header className="page-hero">
        <p className="mono kicker">The word library</p>
        <h1 className="display"><RiseText text="Every word," /> <em><RiseText text="in one place." delay={0.12} /></em></h1>
        <div className="words-stats">
          <span><strong><Counter value={pool.length} /></strong> words selected</span>
          <span className="known-stat"><strong><Counter value={known.length} /></strong> starred as known</span>
        </div>
      </header>
      <div className="words-tools">
        <LessonPicker selected={selected} setSelected={setSelected} />
        <div className="words-search">
          <span aria-hidden="true" className="search-glyph">⌕</span>
          <input className="input" type="search" placeholder="Search English or Arabic…" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search words" />
          <label className="toggle"><input type="checkbox" checked={hideKnown} onChange={event => setHideKnown(event.target.checked)} /><span className="toggle-track"><motion.span className="toggle-knob" layout transition={spring} /></span>Hide known</label>
        </div>
      </div>
      {!groups.length && <div className="empty">{selected.size ? "No words match that search." : "Pick at least one lesson above."}</div>}
      {groups.map(({ lesson, words }) => (
        <section key={lesson.key} className="word-group">
          <div className="word-group-head">
            <h2 className="h3">{lesson.title} <span className="mono muted">· {words.length}</span></h2>
            <Ar className="word-group-ar">{lesson.ar}</Ar>
          </div>
          <ul className="word-list">
            <AnimatePresence initial={false}>
              {words.map((word, index) => (
                <motion.li key={word.id} className={`word-row${knownSet.has(word.id) ? " known" : ""}`}
                  initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.015 }}>
                  <span className="word-en">{word.en}</span>
                  <Ar className="word-ar">{word.ar}</Ar>
                  <SpeakButton text={word.ar} />
                  <StarButton on={knownSet.has(word.id)} onToggle={() => toggleKnown(word.id)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  );
}
