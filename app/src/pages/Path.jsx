import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { KEYS, useStored } from "../lib/storage";
import { LESSONS } from "../data/vocab";
import { GRAMMAR_BANK, GRAMMAR_TITLES, UNIT_GRAMMAR } from "../data/grammar";
import {
  PASS_PERCENT, activeDay, completedDays, currentUnitIndex, loadProgress, loadReview, normalizedWords, overallPercent, unitDays
} from "../lib/curriculum";
import LessonPlayer from "../components/LessonPlayer";
import ExamPlayer from "../components/ExamPlayer";
import ReviewPlayer from "../components/ReviewPlayer";
import UnitMap from "../components/UnitMap";
import MapIcon from "../components/MapIcons";
import { Ar, Counter, RiseText, SpeakButton, spring } from "../components/ui";

function UnitRow({ unit, index, activeIndex, progress, open, onToggle, onOpenDay, onCheckpoint }) {
  const locked = index > activeIndex;
  const current = index === activeIndex;
  const passed = progress.passedUnits.includes(unit.key);
  const days = unitDays(unit);
  const done = completedDays(unit, progress);
  const next = activeDay(unit, progress);
  const ready = current && done === days.length;
  const fill = passed ? 1 : done / days.length;

  return (
    <motion.article
      className={`unit${current ? " current" : ""}${locked ? " locked" : ""}${passed ? " passed" : ""}`}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ ...spring, delay: Math.min(index, 4) * 0.04 }}
    >
      <button type="button" className="unit-head" onClick={onToggle} aria-expanded={open}>
        <span className="unit-index">{String(index + 1).padStart(2, "0")}</span>
        <span className="unit-name">
          <strong>{unit.title}</strong>
          <span className="mono muted">{normalizedWords(unit).length} words · {done}/{days.length} days</span>
        </span>
        <Ar className="unit-ar">{unit.ar}</Ar>
        <span className="unit-meter" aria-hidden="true"><motion.i initial={{ scaleX: 0 }} whileInView={{ scaleX: fill }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} /></span>
        <span className={`unit-status mono${current ? " now" : ""}`}>{passed ? "passed ✓" : current ? "you are here" : locked ? "locked" : "review"}</span>
        <motion.span className="unit-chevron" animate={{ rotate: open ? 180 : 0 }} transition={spring}>↓</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="unit-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
            <UnitMap unit={unit} days={days} progress={progress} current={current} passed={passed} ready={ready} onOpenDay={onOpenDay} onCheckpoint={onCheckpoint} />
            <div className="map-legend mono">
              <span><i className="lg lesson" /> Lesson</span>
              <span><i className="lg homework" /> Homework</span>
              <span><i className="lg done" /> Done</span>
              <span><MapIcon name="flag" size={13} /> Checkpoint · {PASS_PERCENT}%</span>
              <span className="muted">Symbols show each day’s vocabulary theme · tap a stop</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function JoinClass() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState({ text: "", ok: false });
  const [busy, setBusy] = useState(false);
  const [classes, setClasses] = useState([]);
  useEffect(() => { api("/me").then(data => setClasses(data.classes || [])).catch(() => {}); }, []);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const { class: joined } = await api("/classes/join", { method: "POST", body: { code: code.trim().toUpperCase() } });
      setMessage({ text: `Joined ${joined.name}.`, ok: true });
      setClasses(list => (list.some(item => item.id === joined.id) ? list : [...list, joined]));
      setCode("");
    } catch (error) { setMessage({ text: error.message, ok: false }); }
    finally { setBusy(false); }
  };
  return (
    <form className="side-block" onSubmit={submit}>
      <p className="mono kicker">{classes.length ? "Your classes" : "Join a class"}</p>
      {classes.map(item => <span key={item.id} className="class-tag"><strong>{item.name}</strong> <span className="mono muted">{item.course}</span></span>)}
      <div className="join-row">
        <input className="input mono-input" value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={12} placeholder="CLASS CODE" aria-label="Class code" required />
        <button type="submit" className="btn small primary" disabled={busy}>{busy ? "…" : "Join"}</button>
      </div>
      <p className={`form-msg${message.ok ? " ok" : ""}`}>{message.text}</p>
    </form>
  );
}

function UnitNotebook({ defaultKey }) {
  const [key, setKey] = useState(defaultKey);
  const [query, setQuery] = useState("");
  useEffect(() => setKey(defaultKey), [defaultKey]);
  const unit = LESSONS.find(item => item.key === key) || LESSONS[0];
  const words = normalizedWords(unit).filter(word => !query || word.en.toLowerCase().includes(query.toLowerCase()) || word.ar.includes(query));
  const rules = (UNIT_GRAMMAR[unit.key] || []).map(id => GRAMMAR_BANK.find(rule => rule.id === id)).filter(Boolean);
  return (
    <section className="section">
      <div className="section-head">
        <div><p className="mono kicker">Unit notebook</p><h2 className="h2">Everything in one unit</h2></div>
        <select className="select notebook-select" value={unit.key} onChange={event => setKey(event.target.value)} aria-label="Choose a unit">
          {LESSONS.map((item, index) => <option key={item.key} value={item.key}>{String(index + 1).padStart(2, "0")} · {item.title}</option>)}
        </select>
      </div>
      <div className="notebook">
        <div>
          <div className="notebook-tools">
            <span className="mono muted">{words.length} of {normalizedWords(unit).length} words</span>
            <input className="input" type="search" placeholder="Filter Arabic or English…" value={query} onChange={event => setQuery(event.target.value)} aria-label="Filter words" />
          </div>
          <motion.div className="notebook-words" layout>
            <AnimatePresence initial={false}>
              {words.map(word => (
                <motion.div key={word.id} className="nb-word" layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2 }}>
                  <Ar className="nb-ar">{word.ar}</Ar>
                  <span className="nb-en">{word.en}</span>
                  <SpeakButton text={word.ar} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
        <aside className="notebook-rules">
          <p className="mono kicker">Grammar in this unit</p>
          {rules.length ? rules.map((rule, index) => (
            <motion.article key={rule.id} className="rule-card" initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.06, ...spring }}>
              <h3>{GRAMMAR_TITLES[rule.id]}</h3>
              <p>{rule.explain}</p>
            </motion.article>
          )) : <p className="muted">No grammar references linked yet.</p>}
          <p className="mono muted" style={{ fontSize: 10 }}>Grammar-to-unit links are a working draft; instructors can refine them.</p>
        </aside>
      </div>
    </section>
  );
}

export default function Path() {
  const location = useLocation();
  const navigate = useNavigate();
  useStored(KEYS.progress, null);
  useStored(KEYS.review, []);
  const progress = loadProgress();
  const activeIndex = currentUnitIndex(progress);
  const activeUnit = LESSONS[activeIndex];
  const [openUnits, setOpenUnits] = useState(() => new Set([activeUnit?.key, LESSONS[activeIndex - 1]?.key].filter(Boolean)));
  const [player, setPlayer] = useState(null);
  const percent = overallPercent(progress);
  const reviewsDue = loadReview().filter(item => item.dueAt <= Date.now()).length;
  const next = activeUnit ? activeDay(activeUnit, progress) : null;
  const streak = progress.studyDates.length;

  useEffect(() => {
    const state = location.state;
    if (!state) return;
    if (state.open) {
      const unit = LESSONS.find(item => item.key === state.open.unit);
      const day = unit && unitDays(unit).find(item => item.number === state.open.day);
      if (unit && day) setPlayer({ type: "lesson", unit, day });
    } else if (state.checkpoint) {
      const unit = LESSONS.find(item => item.key === state.checkpoint);
      if (unit) setPlayer({ type: "exam", unit });
    } else if (state.review) setPlayer({ type: "review" });
    navigate(".", { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.body.style.overflow = player ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [player]);

  const toggle = key => setOpenUnits(set => { const copy = new Set(set); copy.has(key) ? copy.delete(key) : copy.add(key); return copy; });
  const continuePath = () => setPlayer(next ? { type: "lesson", unit: activeUnit, day: next } : { type: "exam", unit: activeUnit });

  const lastDays = useMemo(() => {
    const dates = new Set(progress.studyDates);
    return Array.from({ length: 14 }, (_, offset) => {
      const date = new Date(Date.now() - (13 - offset) * 86400000).toISOString().slice(0, 10);
      return { date, on: dates.has(date) };
    });
  }, [progress.studyDates]);

  return (
    <div className="page path">
      <header className="path-hero">
        <div>
          <p className="mono kicker">Alif Baa → Al-Kitaab Part 1</p>
          <h1 className="display"><RiseText text="The path," /> <em><RiseText text="one day at a time." delay={0.15} /></em></h1>
          <p className="lede">Lesson days introduce ten words. Homework days bring them back. When a unit’s days are done, its checkpoint unlocks the next unit.</p>
          <div className="hero-actions">
            <button type="button" className="btn stamp" onClick={continuePath}>{next ? `Continue · ${activeUnit.title}, Day ${next.number}` : `Take the ${activeUnit.title} checkpoint`} <span className="arrow">→</span></button>
            <button type="button" className="btn ghost" onClick={() => setPlayer({ type: "placement" })}>Placement test</button>
          </div>
        </div>
        <div className="hero-figure">
          <span className="big-num"><Counter value={percent} suffix="%" /></span>
          <span className="mono muted">of the course</span>
          <svg className="hero-arc" viewBox="0 0 200 110" aria-hidden="true">
            <path d="M10 100 A90 90 0 0 1 190 100" fill="none" stroke="var(--paper-deep)" strokeWidth="10" />
            <motion.path d="M10 100 A90 90 0 0 1 190 100" fill="none" stroke="var(--forest)" strokeWidth="10" initial={{ pathLength: 0 }} animate={{ pathLength: percent / 100 }} transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1], delay: 0.3 }} />
          </svg>
        </div>
      </header>

      <div className="path-layout">
        <section className="roadmap" aria-label="Units">
          {LESSONS.map((unit, index) => (
            <UnitRow key={unit.key} unit={unit} index={index} activeIndex={activeIndex} progress={progress} open={openUnits.has(unit.key)} onToggle={() => toggle(unit.key)}
              onOpenDay={(u, day) => setPlayer({ type: "lesson", unit: u, day })} onCheckpoint={u => setPlayer({ type: "exam", unit: u })} />
          ))}
        </section>
        <aside className="path-side">
          <button type="button" className={`side-block review-block${reviewsDue ? " due" : ""}`} onClick={() => setPlayer({ type: "review" })}>
            <p className="mono kicker">Spaced review</p>
            <span className="review-big"><Counter value={reviewsDue} /></span>
            <span>{reviewsDue === 1 ? "question is" : "questions are"} due. Missed items come back right before you’d forget them.</span>
            <span className="link">Review now →</span>
          </button>
          <div className="side-block">
            <p className="mono kicker">Your rhythm</p>
            <div className="rhythm">
              {lastDays.map((day, index) => (
                <motion.i key={day.date} title={day.date} className={day.on ? "on" : ""} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + index * 0.03, ...spring }} />
              ))}
            </div>
            <p className="muted" style={{ margin: "10px 0 0", fontSize: 15 }}><strong>{streak}</strong> study day{streak === 1 ? "" : "s"} logged. Short and steady beats cramming.</p>
          </div>
          <JoinClass />
        </aside>
      </div>

      <UnitNotebook defaultKey={activeUnit?.key} />

      {createPortal(<AnimatePresence>
        {player?.type === "lesson" && <LessonPlayer key="lesson" unit={player.unit} day={player.day} onClose={() => setPlayer(null)} />}
        {player?.type === "exam" && <ExamPlayer key="exam" unit={player.unit} onClose={() => setPlayer(null)} />}
        {player?.type === "placement" && <ExamPlayer key="placement" mode="placement" onClose={() => setPlayer(null)} />}
        {player?.type === "review" && <ReviewPlayer key="review" onClose={() => setPlayer(null)} />}
      </AnimatePresence>, document.body)}
    </div>
  );
}
