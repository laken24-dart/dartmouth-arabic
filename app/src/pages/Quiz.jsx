import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { KEYS, useStored } from "../lib/storage";
import { LESSON_BY_KEY } from "../data/vocab";
import { speak } from "../lib/speech";
import { shuffle } from "../lib/curriculum";
import LessonPicker, { useSelectedLessons } from "../components/LessonPicker";
import { Ar, Confetti, RiseText, ScoreRing, SpeakButton, spring, useKey } from "../components/ui";
import { OptionButton, Segments } from "../components/questions";
import DaalCoach from "../components/DaalCoach";

function buildQuiz(pool, direction, length) {
  return shuffle(pool).slice(0, Math.min(length, pool.length)).map(word => {
    const d = direction === "mix" ? (Math.random() < 0.5 ? "ar" : "en") : direction;
    const others = shuffle(pool.filter(other => other.id !== word.id && other.en !== word.en && other.ar !== word.ar));
    const same = others.filter(other => other.lesson === word.lesson);
    const picks = [...new Map([...same, ...others].map(other => [other.en, other])).values()].slice(0, 3);
    return { word, d, options: shuffle([word, ...picks]), answer: null };
  });
}

export default function Quiz() {
  const { selected, setSelected, pool } = useSelectedLessons();
  const [direction, setDirection] = useStored(KEYS.quizDir, "ar");
  const [autoplay] = useStored(KEYS.autoplay, false);
  const [length, setLength] = useState(10);
  const [quiz, setQuiz] = useState(null);
  const [celebrate, setCelebrate] = useState(0);
  const item = quiz?.items[quiz.index];
  const finished = quiz && quiz.index >= quiz.items.length;

  const start = items => setQuiz({ items, index: 0 });
  const choose = optionIndex => {
    if (!item || item.answer) return;
    const answer = item.options[optionIndex].id;
    setQuiz(current => ({ ...current, items: current.items.map((entry, i) => (i === current.index ? { ...entry, answer } : entry)) }));
    if (item.d === "en" && autoplay) speak(item.word.ar);
  };
  const next = () => setQuiz(current => ({ ...current, index: current.index + 1 }));

  useEffect(() => { if (item && item.d === "ar" && !item.answer && autoplay) { const timer = setTimeout(() => speak(item.word.ar), 200); return () => clearTimeout(timer); } return undefined; }, [item?.word.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (finished && quiz.items.every(entry => entry.answer === entry.word.id)) setCelebrate(Date.now()); }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps
  useKey(event => {
    const n = Number(event.key);
    if (item && n >= 1 && n <= item.options.length) choose(n - 1);
    if (event.key === "Enter" && item?.answer) next();
  }, [item, quiz]);

  const lastResult = item?.answer ? {
    correct: item.answer === item.word.id,
    detail: {
      kind: item.d === "ar" ? "meaning" : "arabic",
      prompt: item.d === "ar" ? item.word.ar : item.word.en,
      options: item.options.map(option => (item.d === "ar" ? option.en : option.ar)),
      chosen: (() => { const chosen = item.options.find(option => option.id === item.answer); return item.d === "ar" ? chosen?.en : chosen?.ar; })(),
      correct: item.d === "ar" ? item.word.en : item.word.ar
    }
  } : null;
  const streak = quiz ? (() => { let count = 0; for (let i = quiz.index; i >= 0; i--) { const entry = quiz.items[i]; if (entry?.answer && entry.answer === entry.word.id) count++; else if (entry?.answer) break; } return count; })() : 0;

  const results = quiz ? quiz.items.slice(0, quiz.index + (item?.answer ? 1 : 0)).map(entry => entry.answer === entry.word.id) : [];

  return (
    <div className="page quiz">
      <AnimatePresence mode="wait">
        {!quiz && (
          <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <header className="page-hero">
              <p className="mono kicker">Knowledge check</p>
              <h1 className="display"><RiseText text="Ten quick" /> <em><RiseText text="questions." delay={0.12} /></em></h1>
              <p className="lede">Drawn from the {pool.length} words in the lessons you pick. Misses come back at the end so you can retry them.</p>
            </header>
            <div className="quiz-setup sheet">
              <LessonPicker selected={selected} setSelected={setSelected} />
              <div className="quiz-setup-row">
                <div className="seg" role="radiogroup" aria-label="Question direction">
                  {[["ar", "See Arabic"], ["en", "See English"], ["mix", "Mixed"]].map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={direction === value} onClick={() => setDirection(value)}>
                      {direction === value && <motion.span layoutId="seg-quiz-dir" className="seg-fill" transition={spring} />}<span>{label}</span>
                    </button>
                  ))}
                </div>
                <div className="seg" role="radiogroup" aria-label="Number of questions">
                  {[10, 20, 40].map(value => (
                    <button key={value} type="button" role="radio" aria-checked={length === value} onClick={() => setLength(value)}>
                      {length === value && <motion.span layoutId="seg-quiz-len" className="seg-fill" transition={spring} />}<span>{value}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="btn stamp" disabled={pool.length < 4} onClick={() => start(buildQuiz(pool, direction, length))}>Start <span className="arrow">→</span></button>
              </div>
            </div>
          </motion.div>
        )}

        {quiz && item && (
          <motion.div key="run" className="quiz-run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="quiz-top">
              <button type="button" className="link" onClick={() => setQuiz(null)}>← quit</button>
              <Segments results={results} total={quiz.items.length} />
              <span className="mono muted">{quiz.index + 1}/{quiz.items.length}</span>
            </div>
            <DaalCoach line={quiz.index === 0 ? "Ten quick ones — I’ll keep score. Ready?" : item.d === "ar" ? "What does this mean?" : "Which is the Arabic?"} result={lastResult} streak={streak} />
            <AnimatePresence mode="wait">
              <motion.div key={quiz.index} className="q" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.25 }}>
                <p className="mono q-label">{LESSON_BY_KEY[item.word.lesson]?.title} · {item.d === "ar" ? "pick the meaning" : "pick the Arabic"}</p>
                <div className="meaning-word">
                  {item.d === "ar" ? <Ar className="meaning-ar">{item.word.ar}</Ar> : <p className="quiz-en">{item.word.en}</p>}
                  {(item.d === "ar" || item.answer) && <SpeakButton text={item.word.ar} big />}
                </div>
                {item.d === "en" && item.answer && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", marginBottom: 16 }}><Ar className="quiz-reveal">{item.word.ar}</Ar></motion.div>}
                <div className="options">
                  {item.options.map((option, index) => (
                    <OptionButton key={option.id} index={index} arabic={item.d === "en"} disabled={Boolean(item.answer)} onClick={() => choose(index)}
                      state={!item.answer ? "" : option.id === item.word.id ? "correct" : option.id === item.answer ? "wrong" : "dim"}>
                      {item.d === "ar" ? option.en : option.ar}
                    </OptionButton>
                  ))}
                </div>
                <div className="player-foot">
                  <span className="mono muted">keys 1–4 · Enter</span>
                  <button type="button" className="btn primary" disabled={!item.answer} onClick={next}>{quiz.index + 1 >= quiz.items.length ? "See score" : "Next"} <span className="arrow">→</span></button>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {finished && (() => {
          const right = quiz.items.filter(entry => entry.answer === entry.word.id);
          const wrong = quiz.items.filter(entry => entry.answer !== entry.word.id);
          return (
            <motion.div key="done" className="quiz-done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="results-top"><ScoreRing percent={Math.round(right.length / quiz.items.length * 100)} /></div>
              <h2 className="h2" style={{ textAlign: "center" }}>{right.length} of {quiz.items.length}{right.length === quiz.items.length ? " — perfect." : ""}</h2>
              <div className="done-actions" style={{ justifyContent: "center" }}>
                <button type="button" className="btn primary" onClick={() => start(buildQuiz(pool, direction, length))}>New quiz</button>
                {wrong.length > 0 && <button type="button" className="btn stamp" onClick={() => start(shuffle(wrong).map(entry => ({ ...entry, answer: null, options: shuffle(entry.options) })))}>Retry the {wrong.length} I missed</button>}
                <button type="button" className="btn ghost" onClick={() => setQuiz(null)}>Change settings</button>
              </div>
              {wrong.length > 0 && (
                <div className="misses">
                  <p className="mono kicker">To review</p>
                  {wrong.map((entry, index) => (
                    <motion.div key={entry.word.id} className="word-row" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + index * 0.05 }}>
                      <span className="word-en">{entry.word.en}</span><Ar className="word-ar">{entry.word.ar}</Ar><SpeakButton text={entry.word.ar} />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>
      <Confetti fire={celebrate} />
    </div>
  );
}
