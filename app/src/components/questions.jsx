import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Ar, SpeakButton, spring, useKey } from "./ui";

const shake = { x: [0, -9, 8, -6, 4, 0], transition: { duration: 0.42 } };
const pop = { scale: [1, 1.06, 1], transition: { duration: 0.35 } };

export function OptionButton({ index, state, arabic, children, onClick, disabled }) {
  return (
    <motion.button
      type="button"
      className={`option${arabic ? " ar-option" : ""}${state ? ` ${state}` : ""}`}
      onClick={onClick}
      disabled={disabled}
      initial={{ opacity: 0, y: 14 }}
      animate={state === "wrong" ? { opacity: 1, y: 0, ...shake } : state === "correct" ? { opacity: 1, y: 0, ...pop } : { opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, ...spring }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      lang={arabic ? "ar" : undefined}
      dir={arabic ? "rtl" : undefined}
    >
      <span className="key" aria-hidden="true">{state === "correct" ? "✓" : state === "wrong" ? "✕" : index + 1}</span>
      {children}
    </motion.button>
  );
}

export function Feedback({ good, title, children }) {
  return (
    <motion.div className={`feedback${good ? "" : " bad"}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} role="status">
      <motion.span className="feedback-icon" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring, delay: 0.08 }}>{good ? "✓" : "!"}</motion.span>
      <div><strong>{title}</strong>{children}</div>
    </motion.div>
  );
}

/** Step 1: see an Arabic word, pick its English meaning. */
export function MeaningQuestion({ question, onAnswer }) {
  const [picked, setPicked] = useState(null);
  const correctIndex = question.options.findIndex(option => option.id === question.word.id);
  const choose = index => {
    if (picked !== null) return;
    setPicked(index);
    onAnswer(index === correctIndex, { kind: "meaning", prompt: question.originalWord.ar, options: question.options.map(option => option.en), chosen: question.options[index].en, correct: question.word.en });
  };
  useKey(event => { const n = Number(event.key); if (n >= 1 && n <= question.options.length) choose(n - 1); }, [picked, question]);
  return (
    <div className="q">
      <div className="meaning-word">
        <motion.div initial={{ opacity: 0, scale: 0.85, filter: "blur(6px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 0.5 }}>
          <Ar className="meaning-ar">{question.prompt}</Ar>
        </motion.div>
        <SpeakButton text={question.originalWord.ar} big label="Hear the word" />
      </div>
      <div className="options">
        {question.options.map((option, index) => (
          <OptionButton key={option.id} index={index} disabled={picked !== null} onClick={() => choose(index)}
            state={picked === null ? "" : index === correctIndex ? "correct" : index === picked ? "wrong" : "dim"}>
            {option.en}
          </OptionButton>
        ))}
      </div>
      <AnimatePresence>
        {picked !== null && (
          <Feedback good={picked === correctIndex} title={picked === correctIndex ? "Correct." : "Not quite."}>
            <span> <Ar>{question.originalWord.ar}</Ar> means “{question.originalWord.en}.”</span>
          </Feedback>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Step 2: Arabic sentence about Dartmouth life with a blank.
 * The chosen word physically flies into the blank; a wrong pick flies back and the right word takes its place.
 */
export function SentenceQuestion({ question, onAnswer }) {
  const [slot, setSlot] = useState(null);
  const [wrong, setWrong] = useState(null);
  const [done, setDone] = useState(false);
  const correctIndex = question.options.findIndex(option => option.correct || option.id === question.word.id);
  const [before, after = ""] = question.prompt.split("___");

  useEffect(() => { setSlot(null); setWrong(null); setDone(false); }, [question.id]);

  const detail = index => ({ kind: "sentence", prompt: question.prompt, translation: question.translation, options: question.options.map(option => option.ar), chosen: question.options[index].ar, correct: question.word.ar });
  const choose = index => {
    if (slot !== null || done) return;
    setSlot(index);
    if (index === correctIndex) { setDone(true); onAnswer(true, detail(index)); return; }
    setTimeout(() => {
      setWrong(index);
      setSlot(correctIndex);
      setDone(true);
      onAnswer(false, detail(index));
    }, 750);
  };
  useKey(event => { const n = Number(event.key); if (n >= 1 && n <= question.options.length) choose(n - 1); }, [slot, done, question]);

  const chipId = index => `chip-${question.id}-${index}`;
  const slotState = slot === null ? "" : done ? "correct" : slot === correctIndex ? "correct" : "pending";

  return (
    <LayoutGroup id={question.id}>
      <div className="q">
        <div className="sentence-card sheet ruled">
          <p className="sentence" lang="ar" dir="rtl">
            {before}
            <span className={`slot${slot !== null ? " filled" : ""}`}>
              {slot !== null ? (
                <motion.span layoutId={chipId(slot)} className={`word-chip in-slot ${slotState}`} transition={{ type: "spring", stiffness: 260, damping: 24 }}>
                  {question.options[slot].ar}
                </motion.span>
              ) : (
                <motion.span className="slot-blank" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.6, repeat: Infinity }} />
              )}
            </span>
            {after}
          </p>
          <AnimatePresence>
            {done && (
              <motion.div className="sentence-after" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ delay: 0.3 }}>
                <p className="sentence-en">{question.translation}</p>
                <SpeakButton text={question.prompt.replace("___", question.word.ar)} label="Hear the sentence" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="chip-tray">
          {question.options.map((option, index) => (
            <div className="chip-cell" key={option.id}>
              {slot !== index ? (
                <motion.button
                  type="button"
                  layoutId={chipId(index)}
                  className={`word-chip${wrong === index ? " wrong" : ""}${done && index !== correctIndex && wrong !== index ? " dim" : ""}`}
                  onClick={() => choose(index)}
                  disabled={slot !== null || done}
                  lang="ar"
                  dir="rtl"
                  initial={{ opacity: 0, y: 16 }}
                  animate={wrong === index ? { opacity: 1, y: 0, ...shake } : { opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24, delay: slot === null && !done ? index * 0.05 : 0 }}
                  whileHover={slot === null ? { y: -4, rotate: index % 2 ? 1.5 : -1.5 } : undefined}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="chip-key mono" aria-hidden="true">{index + 1}</span>
                  {option.ar}
                </motion.button>
              ) : (
                <span className="word-chip ghost" aria-hidden="true">{option.ar}</span>
              )}
            </div>
          ))}
        </div>
        <AnimatePresence>
          {done && (
            <Feedback good={wrong === null} title={wrong === null ? "Exactly right." : "Close — here’s the word that fits."}>
              <span> <Ar>{question.word.ar}</Ar> means “{question.word.en}.”</span>
            </Feedback>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

/** Grammar multiple choice (English prompt, mixed options). */
export function GrammarQuestion({ question, onAnswer }) {
  const [picked, setPicked] = useState(null);
  const correctIndex = question.options.findIndex(option => option.correct);
  const choose = index => {
    if (picked !== null) return;
    setPicked(index);
    onAnswer(index === correctIndex, { kind: "grammar", prompt: question.prompt, options: question.options.map(option => option.text), chosen: question.options[index].text, correct: question.options[correctIndex]?.text });
  };
  useKey(event => { const n = Number(event.key); if (n >= 1 && n <= question.options.length) choose(n - 1); }, [picked, question]);
  return (
    <div className="q">
      <p className="grammar-prompt">{question.prompt}</p>
      <div className="options">
        {question.options.map((option, index) => (
          <OptionButton key={option.id} index={index} disabled={picked !== null} onClick={() => choose(index)}
            state={picked === null ? "" : index === correctIndex ? "correct" : index === picked ? "wrong" : "dim"}>
            <span dir="auto">{option.text}</span>
          </OptionButton>
        ))}
      </div>
      <AnimatePresence>{picked !== null && <Feedback good={picked === correctIndex} title={picked === correctIndex ? "Correct." : "Not quite."}><span> {question.explain}</span></Feedback>}</AnimatePresence>
    </div>
  );
}

/** Segmented progress bar: each question becomes a green or red tick. */
export function Segments({ results, total }) {
  return (
    <div className="segments" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={results.length}>
      {Array.from({ length: total }, (_, index) => (
        <i key={index}>
          {results[index] !== undefined && (
            <motion.b initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={spring} style={{ background: results[index] ? "var(--forest)" : "var(--stamp)" }} />
          )}
        </i>
      ))}
    </div>
  );
}
