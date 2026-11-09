import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LESSONS } from "../data/vocab";
import {
  EXAM_LENGTH, PASS_PERCENT, loadProgress, makeAssessment, markAssessed,
  recordMiss, recordStudyDay, saveProgress
} from "../lib/curriculum";
import { Confetti, ScoreRing, Stamp, useKey } from "./ui";
import { GrammarQuestion, Segments, SentenceQuestion } from "./questions";
import DaalCoach from "./DaalCoach";

/** Unit checkpoint (mode="checkpoint") or course placement test (mode="placement"). */
export default function ExamPlayer({ unit, mode = "checkpoint", onClose, onFinished }) {
  const placement = mode === "placement";
  const examUnit = placement ? { key: "placement", title: "Course placement" } : unit;
  const [attempt, setAttempt] = useState(0);
  const questions = useMemo(() => makeAssessment(examUnit, { allCourse: placement }), [attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [phase, setPhase] = useState("intro");
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [streak, setStreak] = useState(0);
  const question = questions[index];
  const correct = results.filter(Boolean).length;
  const percent = questions.length ? Math.round(correct / questions.length * 100) : 0;
  const passed = percent >= PASS_PERCENT;

  const answer = (isRight, detail) => {
    setAnswered(true);
    setLastResult({ correct: isRight, detail });
    setStreak(value => (isRight ? value + 1 : 0));
    setResults(list => [...list, isRight]);
    if (!placement) markAssessed(question);
    if (!isRight) recordMiss(question, examUnit);
  };

  const finish = finalResults => {
    const score = Math.round(finalResults.filter(Boolean).length / questions.length * 100);
    if (!placement) {
      const progress = loadProgress();
      const didPass = score >= PASS_PERCENT;
      let next = {
        ...progress,
        passedUnits: didPass && !progress.passedUnits.includes(unit.key) ? [...progress.passedUnits, unit.key] : progress.passedUnits,
        assessmentScores: [...progress.assessmentScores, { unitKey: unit.key, unitTitle: unit.title, score, passed: didPass, at: new Date().toISOString() }]
      };
      if (didPass) { next = recordStudyDay(next); setCelebrate(Date.now()); }
      saveProgress(next);
    }
    setPhase("results");
    onFinished?.();
  };

  const next = () => {
    if (index + 1 >= questions.length) finish(results);
    else { setIndex(index + 1); setAnswered(false); setLastResult(null); }
  };
  useKey(event => { if (event.key === "Enter" && answered && phase === "run") next(); }, [answered, index, phase, results]);

  const retry = () => { setAttempt(value => value + 1); setIndex(0); setResults([]); setAnswered(false); setLastResult(null); setStreak(0); setPhase("run"); };

  const recommended = placement ? LESSONS[percent >= 80 ? Math.min(7, LESSONS.length - 1) : percent >= 65 ? Math.min(4, LESSONS.length - 1) : percent >= 50 ? 1 : 0] : null;
  const unitIndex = LESSONS.findIndex(item => item.key === unit?.key);

  return (
    <motion.div className="player" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 260, damping: 32 }}>
      <div className="player-top">
        <div className="player-top-inner">
          <button type="button" className="player-close" aria-label="Close" onClick={onClose}>×</button>
          <div className="player-title">
            <span className="mono muted">{placement ? "Placement" : `${unit.title} · checkpoint`}</span>
            <strong>{phase === "results" ? "Results" : phase === "intro" ? "Before you start" : `Question ${index + 1} of ${questions.length}`}</strong>
          </div>
          {phase !== "intro" && <Segments results={results} total={questions.length} />}
        </div>
      </div>
      <div className="player-body">
        <AnimatePresence mode="wait">
          {phase === "intro" && (
            <motion.div key="intro" className="exam-intro" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }}>
              <p className="mono kicker">{placement ? "Find your starting point" : "Unit checkpoint"}</p>
              <h2 className="display" style={{ fontSize: "clamp(40px, 7vw, 80px)" }}>{placement ? <>Where should <em>you</em> start?</> : <>Show what <em>stuck.</em></>}</h2>
              {questions.length < EXAM_LENGTH ? (
                <p className="lede">There aren’t enough sentence questions for this material yet to build a full {EXAM_LENGTH}-question test.</p>
              ) : (
                <>
                  <ul className="exam-rules">
                    <li><strong>{EXAM_LENGTH}</strong><span>questions: 12 Arabic sentences to complete, 3 grammar.</span></li>
                    <li><strong>7–10</strong><span>minutes. No timer — take your time.</span></li>
                    <li><strong>{placement ? "—" : `${PASS_PERCENT}%`}</strong><span>{placement ? "This only suggests a starting unit; nothing is marked passed." : `to unlock the next unit. Covers everything from Alif Baa through ${unit.title}.`}</span></li>
                  </ul>
                  <button type="button" className="btn stamp" onClick={() => setPhase("run")}>Begin <span className="arrow">→</span></button>
                </>
              )}
            </motion.div>
          )}
          {phase === "run" && question && (
            <motion.div key={`${attempt}-${index}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.28 }}>
              <DaalCoach
                line={question.kind === "sentence" ? (index === 0 ? "Checkpoint time — I’m your examiner today. Pick the word that completes each sentence." : "Which word completes this one?") : "A grammar question — take your time."}
                result={lastResult} streak={streak} />
              {question.kind === "sentence"
                ? <SentenceQuestion question={question} onAnswer={answer} />
                : <GrammarQuestion question={question} onAnswer={answer} />}
              <div className="player-foot">
                <span className="mono muted">{correct} correct so far</span>
                <button type="button" className="btn primary" disabled={!answered} onClick={next}>{index + 1 >= questions.length ? "See results" : "Next"} <span className="arrow">→</span></button>
              </div>
            </motion.div>
          )}
          {phase === "results" && (
            <motion.div key="results" className="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <DaalCoach mood={placement || passed ? "celebrate" : "encourage"}
                line={placement ? "Thanks! Here’s where I think you should start." : passed ? `ممتاز! You passed ${unit.title}. On to the next unit!` : "Not this time — but you’re close. Review the words you missed and we’ll try a fresh set."} />
              <div className="results-top">
                <ScoreRing percent={percent} pass={placement || passed} />
                {!placement && <Stamp color={passed ? "var(--forest)" : "var(--stamp)"}>{passed ? "PASSED" : "NOT YET"}</Stamp>}
              </div>
              <h2 className="h2">{placement ? "Your suggested starting point" : passed ? "Checkpoint passed." : "Not quite there yet."}</h2>
              <p className="lede">
                {placement
                  ? <>Based on this short test, a good place to start is <strong>{recommended.title}</strong>. An instructor-approved rubric can replace this rule later.</>
                  : passed
                    ? `You got ${correct} of ${questions.length}. ${LESSONS[unitIndex + 1] ? `${LESSONS[unitIndex + 1].title} is now unlocked.` : "You’ve finished the course material."}`
                    : `You got ${correct} of ${questions.length}; you need ${PASS_PERCENT}%. Your daily progress is saved — try a fresh set of questions.`}
              </p>
              <div className="done-actions">
                {placement && <button type="button" className="btn stamp" onClick={() => { const progress = loadProgress(); saveProgress({ ...progress, placementStartUnit: recommended.key }); onClose(); }}>Start at {recommended.title}</button>}
                {!placement && !passed && <button type="button" className="btn stamp" onClick={retry}>Try again</button>}
                <button type="button" className="btn" onClick={onClose}>{placement ? "Keep my current path" : "Back to the path"}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Confetti fire={celebrate} count={70} />
    </motion.div>
  );
}
