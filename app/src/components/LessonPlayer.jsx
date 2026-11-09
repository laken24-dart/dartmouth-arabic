import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { speak } from "../lib/speech";
import {
  buildSentenceQuestions, createMeaningQuestion, dayWords, fetchClasswork, loadProgress,
  recordMiss, recordStudyDay, saveProgress, shuffle
} from "../lib/curriculum";
import { Ar, Confetti, SpeakButton, Stamp, spring, useKey } from "./ui";
import { MeaningQuestion, Segments, SentenceQuestion } from "./questions";
import DaalCoach from "./DaalCoach";

function MeetWords({ words, onDone }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const word = words[index];
  const go = delta => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= words.length) { onDone(); return; }
    setDirection(delta);
    setIndex(next);
  };
  useEffect(() => { const timer = setTimeout(() => speak(word.ar), 350); return () => clearTimeout(timer); }, [word]);
  useKey(event => { if (event.key === "ArrowRight" || event.key === "Enter") go(1); if (event.key === "ArrowLeft") go(-1); }, [index]);
  const [singular, ...forms] = word.ar.split("/");
  return (
    <div className="meet">
      <p className="mono q-label">Meet the words · {index + 1} of {words.length}</p>
      <div className="meet-stage">
        <AnimatePresence mode="popLayout" custom={direction}>
          <motion.article
            key={word.id}
            className="meet-card sheet"
            custom={direction}
            initial={{ x: 120 * direction, rotate: 6 * direction, opacity: 0 }}
            animate={{ x: 0, rotate: index % 2 ? 1.2 : -1.2, opacity: 1 }}
            exit={{ x: -160 * direction, rotate: -8 * direction, opacity: 0 }}
            transition={spring}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, info) => { if (info.offset.x < -90) go(1); else if (info.offset.x > 90) go(-1); }}
          >
            <span className="meet-num mono">{String(index + 1).padStart(2, "0")}</span>
            <Ar className="meet-ar">{singular}</Ar>
            {forms.length > 0 && <Ar className="meet-forms">{forms.join(" · ")}</Ar>}
            <motion.p className="meet-en" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>{word.en}</motion.p>
            <SpeakButton text={word.ar} big label="Hear it again" />
          </motion.article>
        </AnimatePresence>
      </div>
      <div className="meet-dots">
        {words.map((item, dot) => (
          <motion.button key={item.id} type="button" aria-label={`Word ${dot + 1}`} className={dot === index ? "on" : dot < index ? "seen" : ""} onClick={() => { setDirection(dot > index ? 1 : -1); setIndex(dot); }} animate={{ width: dot === index ? 26 : 8 }} transition={spring} />
        ))}
      </div>
      <div className="meet-actions">
        <button type="button" className="btn ghost" onClick={() => go(-1)} disabled={index === 0}>← Back</button>
        <button type="button" className="btn primary" onClick={() => go(1)}>{index === words.length - 1 ? "I’m ready to practice" : "Next word"} <span className="arrow">→</span></button>
      </div>
      <p className="mono muted meet-hint">Swipe the card or use ← → keys · <button type="button" className="link" onClick={onDone}>skip to practice</button></p>
    </div>
  );
}

function AssignedHomework({ assignment, onSubmitted }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) { setMessage("Write a response before submitting."); return; }
    setBusy(true);
    try { await api(`/homework/${encodeURIComponent(assignment.id)}/submit`, { method: "POST", body: { response: text.trim() } }); onSubmitted(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="q">
      <p className="mono q-label">From your instructor{assignment.dueDate ? ` · due ${assignment.dueDate}` : ""}</p>
      <div className="sheet assignment">
        <h2 className="h3">{assignment.title}</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{assignment.instructions}</p>
      </div>
      <label className="field" style={{ marginTop: 22 }}><span>Your response</span>
        <textarea className="textarea" rows={7} value={text} onChange={event => setText(event.target.value)} placeholder="Write your answer here…" dir="auto" />
      </label>
      <p className="form-msg">{message}</p>
      <button type="button" className="btn primary" onClick={submit} disabled={busy}>{busy ? "Sending…" : <>Submit & continue <span className="arrow">→</span></>}</button>
    </div>
  );
}

export default function LessonPlayer({ unit, day, onClose, onComplete }) {
  const words = useMemo(() => shuffle(dayWords(unit, day)), [unit, day]);
  const [classwork, setClasswork] = useState({ lesson: null, homework: null });
  const [stage, setStage] = useState("loading");
  useEffect(() => {
    let live = true;
    fetchClasswork(unit, day).then(work => {
      if (!live) return;
      setClasswork(work);
      setStage(day.kind === "homework" && work.homework && !work.homework.mySubmission ? "assignment" : day.kind === "lesson" ? "meet" : "meaning");
    });
    return () => { live = false; };
  }, [unit, day]);
  const meaning = useMemo(() => words.map(word => createMeaningQuestion(unit, word, day.number)).filter(Boolean), [words, unit, day]);
  const [sentences, setSentences] = useState(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [streak, setStreak] = useState(0);

  const questions = stage === "meaning" ? meaning : stage === "sentence" ? sentences || [] : [];
  const question = questions[index];
  const total = meaning.length + (sentences?.length ?? Math.min(words.length, 10));
  const resultOffset = stage === "sentence" ? meaning.length : 0;

  useEffect(() => {
    if (stage === "sentence" && !sentences) setSentences(buildSentenceQuestions(unit, day, words));
  }, [stage, sentences, unit, day, words]);

  useEffect(() => {
    if ((stage === "sentence" && sentences && !sentences.length) || (stage === "meaning" && !meaning.length)) advanceStage();
  }, [stage, sentences, meaning.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function advanceStage() {
    setIndex(0);
    setAnswered(false);
    setLastResult(null);
    if (stage === "meaning") setStage("sentence");
    else if (stage === "sentence") finish();
  }

  function finish() {
    const progress = loadProgress();
    const next = recordStudyDay({ ...progress, days: progress.days.includes(day.id) ? progress.days : [...progress.days, day.id] });
    saveProgress(next);
    setStage("done");
    setCelebrate(Date.now());
    onComplete?.();
  }

  const answer = (correct, detail) => {
    setAnswered(true);
    setLastResult({ correct, detail });
    setStreak(value => (correct ? value + 1 : 0));
    setResults(list => { const copy = list.slice(); copy[resultOffset + index] = correct; return copy; });
    if (!correct) recordMiss(question, unit);
  };
  const next = () => {
    if (index + 1 >= questions.length) advanceStage();
    else { setIndex(index + 1); setAnswered(false); setLastResult(null); }
  };
  useKey(event => { if (event.key === "Enter" && answered) next(); }, [answered, index, stage, questions.length]);
  useKey(event => { if (event.key === "Escape") onClose(); }, []);

  const score = results.filter(Boolean).length;
  const coachLine = {
    loading: "One moment — opening your day…",
    assignment: "Your instructor left you homework. Write your answer, then we’ll practice together.",
    meet: index === 0 && day.kind === "lesson" ? "Let’s meet today’s words! Listen, say each one out loud, then swipe to the next." : "Listen, repeat, swipe.",
    meaning: index === 0 ? "Step 1 — I’ll show you an Arabic word. What does it mean?" : "What does this one mean?",
    sentence: index === 0 ? "Step 2 — I wrote sentences about life at Dartmouth. Pick the word that completes each one." : "Which word completes my sentence?",
    done: `أحسنت! Day ${day.number} is done. ${score === results.length && results.length ? "A perfect day!" : "See you tomorrow?"}`
  }[stage];
  const stepName = { loading: "", assignment: "Instructor homework", meet: "Meet the words", meaning: "Step 1 · Meanings", sentence: "Step 2 · Sentences", done: "Done" }[stage];

  return (
    <motion.div className="player" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 260, damping: 32 }}>
      <div className="player-top">
        <div className="player-top-inner">
          <button type="button" className="player-close" aria-label="Close lesson" onClick={onClose}>×</button>
          <div className="player-title">
            <span className="mono muted">{unit.title} · Day {day.number}</span>
            <strong>{stepName}</strong>
          </div>
          {stage !== "meet" && stage !== "assignment" && stage !== "loading" && <Segments results={results} total={total} />}
        </div>
      </div>
      <div className="player-body">
        {classwork.lesson && stage === "meet" && (
          <details className="teacher-plan">
            <summary className="mono">Instructor plan · {classwork.lesson.title}</summary>
            {classwork.lesson.steps.map((step, stepIndex) => <article key={stepIndex}><strong>{stepIndex + 1}. {step.title}</strong><p>{step.body}</p></article>)}
          </details>
        )}
        {<DaalCoach line={coachLine} result={lastResult} streak={streak} mood={stage === "done" ? "celebrate" : undefined} compact={stage === "meet"} />}
        <AnimatePresence mode="wait">
          <motion.div key={`${stage}-${index}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}>
            {stage === "loading" && <p className="muted">Opening your day…</p>}
            {stage === "assignment" && <AssignedHomework assignment={classwork.homework} onSubmitted={() => setStage("meaning")} />}
            {stage === "meet" && <MeetWords words={words} onDone={() => setStage("meaning")} />}
            {stage === "meaning" && question && <MeaningQuestion question={question} onAnswer={answer} />}
            {stage === "sentence" && question && <SentenceQuestion question={question} onAnswer={answer} />}
            {stage === "sentence" && !sentences && <p className="muted">Preparing sentences…</p>}
            {stage === "done" && (
              <div className="done">
                <Stamp>تمّ</Stamp>
                <h2 className="display" style={{ fontSize: "clamp(40px, 7vw, 76px)" }}>Day {day.number}, <em>done.</em></h2>
                <p className="lede">You got {score} of {results.length} right{results.length && score === results.length ? " — a perfect day." : "."} Anything you missed is now waiting in your spaced review.</p>
                <button type="button" className="btn primary" onClick={onClose}>Back to the path <span className="arrow">→</span></button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        {(stage === "meaning" || stage === "sentence") && question && (
          <div className="player-foot">
            <span className="mono muted">{index + 1} / {questions.length} · keys 1–4, Enter</span>
            <motion.button type="button" className="btn primary" disabled={!answered} onClick={next} animate={answered ? { scale: [1, 1.05, 1] } : {}}>
              {index + 1 >= questions.length ? (stage === "meaning" ? "On to sentences" : "Finish the day") : "Next"} <span className="arrow">→</span>
            </motion.button>
          </div>
        )}
      </div>
      <Confetti fire={celebrate} />
    </motion.div>
  );
}
