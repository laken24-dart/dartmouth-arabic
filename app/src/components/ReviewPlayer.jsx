import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { loadReview, scheduleReview } from "../lib/curriculum";
import { Ar, SpeakButton, Stamp, spring } from "./ui";
import { Feedback, OptionButton } from "./questions";

function ReviewPrompt({ item, answered }) {
  if (item.prompt?.includes("___")) {
    const [before, after = ""] = item.prompt.split("___");
    return (
      <div className="sentence-card sheet ruled">
        <p className="sentence" lang="ar" dir="rtl">
          {before}
          <span className={`slot${answered ? " filled" : ""}`}>
            {answered ? <motion.span className="word-chip in-slot correct" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{item.correctLabel}</motion.span> : <span className="slot-blank" />}
          </span>
          {after}
        </p>
      </div>
    );
  }
  if (item.promptDir === "rtl") return <div className="meaning-word"><Ar className="meaning-ar">{item.prompt}</Ar></div>;
  return <p className="grammar-prompt">{item.prompt}</p>;
}

export default function ReviewPlayer({ onClose }) {
  const [version, setVersion] = useState(0);
  const due = loadReview().filter(item => item.dueAt <= Date.now()).sort((a, b) => a.dueAt - b.dueAt);
  const upcoming = loadReview().filter(item => item.dueAt > Date.now()).length;
  const item = due[0];
  const [picked, setPicked] = useState(null);
  const correct = item && picked !== null && item.options[picked] === item.correctLabel;

  const rate = rating => { scheduleReview(item.id, rating); setPicked(null); setVersion(value => value + 1); };

  return (
    <motion.div className="player" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 260, damping: 32 }}>
      <div className="player-top">
        <div className="player-top-inner">
          <button type="button" className="player-close" aria-label="Close review" onClick={onClose}>×</button>
          <div className="player-title"><span className="mono muted">Spaced review</span><strong>{due.length ? `${due.length} due` : "All caught up"}</strong></div>
        </div>
      </div>
      <div className="player-body">
        <AnimatePresence mode="wait">
          {!item ? (
            <motion.div key="empty" className="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Stamp color="var(--forest)">✓</Stamp>
              <h2 className="h2">Nothing to review right now.</h2>
              <p className="lede">{upcoming ? `${upcoming} item${upcoming === 1 ? " is" : "s are"} scheduled for later — they’ll come back right before you’d forget them.` : "Questions you miss in lessons and checkpoints will show up here."}</p>
              <button type="button" className="btn primary" onClick={onClose}>Back to the path</button>
            </motion.div>
          ) : (
            <motion.div key={`${item.id}-${version}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.28 }}>
              <div className="q">
                <p className="mono q-label">{item.unitTitle} · missed {item.misses} time{item.misses === 1 ? "" : "s"}</p>
                <ReviewPrompt item={item} answered={picked !== null} />
                {item.audioText && <div style={{ margin: "14px 0" }}><SpeakButton text={item.audioText} label="Hear the Arabic" /></div>}
                <div className="options">
                  {item.options.map((option, index) => (
                    <OptionButton key={`${option}-${index}`} index={index} arabic={item.direction === "rtl"} disabled={picked !== null} onClick={() => setPicked(index)}
                      state={picked === null ? "" : option === item.correctLabel ? "correct" : index === picked ? "wrong" : "dim"}>
                      {option}
                    </OptionButton>
                  ))}
                </div>
                <AnimatePresence>
                  {picked !== null && (
                    <>
                      <Feedback good={correct} title={correct ? "Remembered." : "Not this time."}><span> {item.explanation}</span></Feedback>
                      <motion.div className="ratings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }}>
                        <span className="mono muted">{correct ? "How easy was that?" : ""}</span>
                        {correct ? (
                          <>
                            <button type="button" className="btn small" onClick={() => rate("hard")}>Hard · soon</button>
                            <button type="button" className="btn small primary" onClick={() => rate("good")}>Good</button>
                            <button type="button" className="btn small" onClick={() => rate("easy")}>Easy · later</button>
                          </>
                        ) : <button type="button" className="btn small stamp" onClick={() => rate("again")}>See it again tomorrow</button>}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
