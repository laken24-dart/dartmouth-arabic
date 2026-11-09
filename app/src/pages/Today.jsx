import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "../lib/auth";
import { KEYS, asArray, useStored } from "../lib/storage";
import { LESSONS } from "../data/vocab";
import { activeDay, completedDays, currentUnitIndex, dayWords, loadProgress, loadReview, overallPercent, unitDays } from "../lib/curriculum";
import { Ar, Counter, Marquee, RiseText, SpeakButton, Squiggle, Tilt, spring } from "../components/ui";
import Daal from "../components/Daal";
import { openDaal } from "../lib/daal";

const PHRASES = [
  { ar: "صباح الخير", tr: "ṣabāḥ al-khayr", en: "Good morning", note: "The reply is صباح النور — “morning of light.” Use it on the way into a 9L." },
  { ar: "كيف حالك؟", tr: "kayfa ḥāluk?", en: "How are you?", note: "To a woman: كيف حالكِ (ḥāluki). The usual answer: بخير، الحمد لله." },
  { ar: "عندي سؤال", tr: "ʿindī suʾāl", en: "I have a question", note: "Your best friend in office hours. Raise a hand and lead with it." },
  { ar: "شو الأخبار؟", tr: "shū l-akhbār?", en: "What’s new?", note: "Levantine colloquial. In formal Arabic: ما الأخبار؟" },
  { ar: "إن شاء الله", tr: "in shāʾ allāh", en: "God willing", note: "Said about anything in the future — including whether you’ll finish the reading." },
  { ar: "مع السلامة", tr: "maʿa s-salāma", en: "Goodbye (go with safety)", note: "The reply is الله يسلّمك — “may God keep you safe.”" },
  { ar: "معليش", tr: "maʿlēsh", en: "Never mind / it’s okay", note: "Colloquial and endlessly useful when the Coach is late again." },
  { ar: "يعطيك العافية", tr: "yaʿṭīk al-ʿāfya", en: "May God give you strength", note: "Said to someone who has been working hard — a TA, a barista at Collis." }
];

const MODES = [
  { to: "/path", n: "01", title: "Follow the path", body: "Day-by-day lessons, homework and checkpoints.", glyph: "ط" },
  { to: "/cards", n: "02", title: "Flip cards", body: "Swipe through words you’re learning.", glyph: "ب" },
  { to: "/quiz", n: "03", title: "Quick quiz", body: "Ten fast questions from any lessons.", glyph: "س" },
  { to: "/words", n: "04", title: "Word library", body: "Every word, searchable, with audio.", glyph: "ك" },
  { to: "/grammar", n: "05", title: "Grammar", body: "Pronouns, negation, numbers and more.", glyph: "ق" }
];

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? { ar: "صباح الخير", en: "Good morning" } : hour < 18 ? { ar: "مساء الخير", en: "Good afternoon" } : { ar: "مساء الخير", en: "Good evening" };
}

export default function Today() {
  const session = useSession();
  const navigate = useNavigate();
  const [known] = useStored(KEYS.known, [], asArray);
  useStored(KEYS.progress, null);
  const progress = loadProgress();
  const reviewsDue = loadReview().filter(item => item.dueAt <= Date.now()).length;
  const unitIndex = currentUnitIndex(progress);
  const unit = LESSONS[unitIndex];
  const next = unit ? activeDay(unit, progress) : null;
  const preview = next ? dayWords(unit, next).slice(0, 6) : [];
  const percent = overallPercent(progress);
  const hello = greeting();
  const [phraseIndex, setPhraseIndex] = useState(() => Math.floor(Date.now() / 86400000) % PHRASES.length);
  const phrase = PHRASES[phraseIndex];
  const [revealed, setRevealed] = useState(false);
  const marqueeWords = useMemo(() => (unit?.words || []).slice(0, 24).map(word => ({ ar: word.ar.split("/")[0], en: word.en.split("/")[0] })), [unit]);
  const date = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  const openNext = () => navigate("/path", { state: next ? { open: { unit: unit.key, day: next.number } } : { checkpoint: unit.key } });

  return (
    <div className="page today">
      <header className="today-head">
        <motion.p className="mono today-date" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{date}</motion.p>
        <div className="today-greet">
          <motion.div className="ar today-greet-ar" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.1 }}>{hello.ar}</motion.div>
          <h1 className="display">
            <RiseText text={`${hello.en},`} />{" "}
            <em><RiseText text={`${session?.name?.split(" ")[0] || "friend"}.`} delay={0.18} /></em>
          </h1>
          <div className="today-squiggle"><Squiggle width={260} delay={0.7} /></div>
        </div>
      </header>

      <section className="next-grid">
        <motion.article className="sheet next-card ruled margin-line" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.25 }}>
          <motion.div className="next-daal" initial={{ opacity: 0, y: 20, rotate: 8 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ ...spring, delay: 0.6 }}>
            <button type="button" className="next-daal-btn" onClick={() => openDaal({ mode: "ask" })} aria-label="Ask Daal a question"><Daal mood="wave" size={112} /></button>
            <span className="next-daal-say">{next ? (next.kind === "lesson" ? "New words today — I’ll quiz you!" : "Let’s bring back yesterday’s words.") : "Checkpoint time. You’ve got this."}</span>
          </motion.div>
          <div className="next-card-inner">
            <p className="mono kicker">{next ? "Up next on your path" : "Checkpoint ready"}</p>
            <h2 className="h2">{unit?.title} · {next ? `Day ${next.number}` : "Checkpoint"}</h2>
            <p className="next-sub">{next ? (next.kind === "lesson" ? `${next.title}: meet ${preview.length ? dayWords(unit, next).length : 10} new words, then use them in sentences about life on campus.` : `${next.title}: bring back the last lesson’s words in new Dartmouth sentences.`) : "Every day in this unit is done. Score 75% on the checkpoint to unlock the next one."}</p>
            {preview.length > 0 && (
              <div className="next-preview">
                {preview.map((word, index) => (
                  <motion.span key={word.id} className="next-preview-word" initial={{ opacity: 0, y: 12, rotate: index % 2 ? 3 : -3 }} animate={{ opacity: 1, y: 0, rotate: index % 2 ? 1.5 : -1.5 }} transition={{ delay: 0.5 + index * 0.06, ...spring }} whileHover={{ y: -4, rotate: 0 }}>
                    <Ar>{word.ar.split("/")[0]}</Ar>
                  </motion.span>
                ))}
                <span className="mono muted">+ more</span>
              </div>
            )}
            <button type="button" className="btn stamp" onClick={openNext}>{next ? (next.kind === "lesson" ? "Start the lesson" : "Do the homework") : "Take the checkpoint"} <span className="arrow">→</span></button>
          </div>
        </motion.article>

        <motion.aside className="next-side" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.35 }}>
          <div className="progress-dial">
            <span className="mono muted">Course complete</span>
            <strong className="big-num"><Counter value={percent} suffix="%" /></strong>
            <div className="unit-strip" aria-label={`${percent}% of the course complete`}>
              {LESSONS.map((item, index) => {
                const fill = progress.passedUnits.includes(item.key) ? 1 : completedDays(item, progress) / unitDays(item).length;
                return (
                  <span key={item.key} className={`unit-strip-seg${index === unitIndex ? " current" : ""}`} title={`${item.title}: ${Math.round(fill * 100)}%`}>
                    <motion.i initial={{ scaleY: 0 }} animate={{ scaleY: fill }} transition={{ delay: 0.6 + index * 0.03, ...spring }} />
                  </span>
                );
              })}
            </div>
            <span className="mono muted">Alif Baa ··· Lesson 19</span>
          </div>
          <Link to="/path" state={{ review: true }} className={`review-pill${reviewsDue ? " due" : ""}`}>
            <span className="review-count"><Counter value={reviewsDue} /></span>
            <span><strong>{reviewsDue === 1 ? "review" : "reviews"} due</strong><small>{reviewsDue ? "Missed questions, spaced out so they stick." : "Nothing due — nice."}</small></span>
            <span className="arrow">→</span>
          </Link>
        </motion.aside>
      </section>

      <section className="stats-row">
        {[
          { value: known.length, label: "words starred as known" },
          { value: completedDaysTotal(progress), label: "study days finished" },
          { value: progress.passedUnits.length, label: "checkpoints passed" },
          { value: progress.studyDates.length, label: "days you showed up" }
        ].map((stat, index) => (
          <motion.div key={stat.label} className="stat" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08, ...spring }}>
            <strong><Counter value={stat.value} /></strong>
            <span>{stat.label}</span>
          </motion.div>
        ))}
      </section>

      {marqueeWords.length > 0 && <Marquee items={marqueeWords} speed={60} />}

      <section className="section">
        <div className="section-head"><h2 className="h2">Ways to practice</h2><span className="num">05 modes</span></div>
        <div className="modes">
          {MODES.map((mode, index) => (
            <motion.div key={mode.to} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: index * 0.07, ...spring }}>
              <Tilt className="mode-card">
                <Link to={mode.to} className="mode-link">
                  <span className="mono mode-n">{mode.n}</span>
                  <span className="ar mode-glyph" aria-hidden="true">{mode.glyph}</span>
                  <span className="mode-title">{mode.title}</span>
                  <span className="mode-body">{mode.body}</span>
                  <span className="mode-go">Open <span className="arrow">→</span></span>
                </Link>
              </Tilt>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="section phrase">
        <div className="section-head"><h2 className="h2">Today’s phrase</h2>
          <button type="button" className="link" onClick={() => { setRevealed(false); setPhraseIndex(index => (index + 1) % PHRASES.length); }}>Another one ↻</button>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={phraseIndex} className="phrase-body" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={spring}>
            <div className="phrase-ar-wrap">
              <Ar className="phrase-ar">{phrase.ar}</Ar>
              <SpeakButton text={phrase.ar} big label="Hear the phrase" />
            </div>
            <div className="phrase-meta">
              <p className="mono">{phrase.tr}</p>
              <button type="button" className={`phrase-reveal${revealed ? " open" : ""}`} onClick={() => setRevealed(true)} aria-expanded={revealed}>
                <AnimatePresence mode="wait" initial={false}>
                  {revealed
                    ? <motion.span key="en" initial={{ rotateX: 90 }} animate={{ rotateX: 0 }} className="phrase-en">“{phrase.en}”</motion.span>
                    : <motion.span key="q" exit={{ rotateX: -90 }} className="phrase-guess">Guess the meaning, then tap</motion.span>}
                </AnimatePresence>
              </button>
              <AnimatePresence>{revealed && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="phrase-note">{phrase.note}</motion.p>}</AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}

function completedDaysTotal(progress) {
  return LESSONS.reduce((sum, unit) => sum + completedDays(unit, progress), 0);
}
