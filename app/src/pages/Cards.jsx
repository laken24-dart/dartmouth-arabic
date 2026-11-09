import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { KEYS, asArray, read, useStored } from "../lib/storage";
import { LESSON_BY_KEY } from "../data/vocab";
import { speak } from "../lib/speech";
import { shuffle } from "../lib/curriculum";
import LessonPicker, { useSelectedLessons } from "../components/LessonPicker";
import { Ar, Confetti, RiseText, SpeakButton, spring, useKey } from "../components/ui";

function SwipeCard({ word, dir, onSwipe, flipped, setFlipped, autoplay }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-16, 16]);
  const keepOpacity = useTransform(x, [-140, -40], [1, 0]);
  const gotOpacity = useTransform(x, [40, 140], [0, 1]);
  const [singular, ...forms] = word.ar.split("/");
  const arFace = (
    <div className="card-face-inner">
      <Ar className="card-ar">{singular}</Ar>
      {forms.length > 0 && <Ar className="card-forms">{forms.join(" · ")}</Ar>}
    </div>
  );
  const enFace = <div className="card-face-inner"><p className="card-en">{word.en}</p></div>;

  useEffect(() => {
    if (autoplay && ((dir === "ar" && !flipped) || (dir === "en" && flipped))) {
      const timer = setTimeout(() => speak(word.ar), 220);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [word, flipped, dir, autoplay]);

  const fling = direction => {
    animate(x, direction * 520, { duration: 0.32, ease: [0.4, 0, 1, 1] }).then(() => onSwipe(direction));
  };

  return (
    <motion.div
      className="swipe-card"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={(_, info) => {
        if (info.offset.x > 120 || info.velocity.x > 700) fling(1);
        else if (info.offset.x < -120 || info.velocity.x < -700) fling(-1);
      }}
      initial={{ scale: 0.92, y: 24, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={spring}
      data-fling
      ref={node => { if (node) node.fling = fling; }}
    >
      <motion.span className="swipe-label keep" style={{ opacity: keepOpacity }}>still learning</motion.span>
      <motion.span className="swipe-label got" style={{ opacity: gotOpacity }}>got it ★</motion.span>
      <motion.div className="flip" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 240, damping: 24 }} onClick={() => setFlipped(!flipped)} role="button" tabIndex={0} aria-label="Flip card">
        <div className="flip-face front sheet ruled">
          <span className="card-tag mono">{LESSON_BY_KEY[word.lesson]?.title}</span>
          {dir === "ar" ? arFace : enFace}
          <span className="card-hint mono">tap to flip</span>
        </div>
        <div className="flip-face back sheet">
          <span className="card-tag mono">{LESSON_BY_KEY[word.lesson]?.title}</span>
          {dir === "ar" ? enFace : arFace}
          <div className="card-back-speak" onClick={event => event.stopPropagation()}><SpeakButton text={word.ar} big /></div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Cards() {
  const { selected, setSelected, pool } = useSelectedLessons();
  const [known, setKnown] = useStored(KEYS.known, [], asArray);
  const [dir, setDir] = useStored(KEYS.cardDir, "ar");
  const [autoplay, setAutoplay] = useStored(KEYS.autoplay, false);
  const [skipKnown, setSkipKnown] = useState(true);
  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ got: 0, keep: 0 });
  const [celebrate, setCelebrate] = useState(0);

  const build = () => {
    const knownNow = new Set(read(KEYS.known, []));
    setDeck(shuffle(pool.filter(word => !(skipKnown && knownNow.has(word.id)))));
    setIndex(0); setFlipped(false); setTally({ got: 0, keep: 0 });
  };
  useEffect(build, [selected.size, [...selected].join(), skipKnown]); // eslint-disable-line react-hooks/exhaustive-deps

  const word = deck[index];
  const swipe = direction => {
    if (!word) return;
    if (direction > 0 && !known.includes(word.id)) setKnown(list => [...list, word.id]);
    if (direction < 0 && known.includes(word.id)) setKnown(list => list.filter(id => id !== word.id));
    setTally(value => ({ ...value, [direction > 0 ? "got" : "keep"]: value[direction > 0 ? "got" : "keep"] + 1 }));
    setFlipped(false);
    if (index + 1 >= deck.length) setCelebrate(Date.now());
    setIndex(value => value + 1);
  };
  const flingTop = direction => { const node = document.querySelector("[data-fling]"); if (node?.fling) node.fling(direction); else swipe(direction); };

  useKey(event => {
    if (!word) return;
    if (event.key === " ") { event.preventDefault(); setFlipped(value => !value); }
    else if (event.key === "ArrowRight" || event.key.toLowerCase() === "k") flingTop(1);
    else if (event.key === "ArrowLeft") flingTop(-1);
    else if (event.key.toLowerCase() === "p") speak(word.ar);
  }, [word, index, deck]);

  const remaining = Math.max(0, deck.length - index);

  return (
    <div className="page cards">
      <header className="page-hero">
        <p className="mono kicker">Flashcards</p>
        <h1 className="display"><RiseText text="Flip it." /> <em><RiseText text="Swipe it." delay={0.12} /></em></h1>
      </header>
      <div className="cards-tools">
        <LessonPicker selected={selected} setSelected={setSelected} />
        <div className="cards-options">
          <div className="seg" role="radiogroup" aria-label="Card direction">
            {[["ar", "Arabic first"], ["en", "English first"]].map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={dir === value} onClick={() => { setDir(value); setFlipped(false); }}>
                {dir === value && <motion.span layoutId="seg-cards" className="seg-fill" transition={spring} />}<span>{label}</span>
              </button>
            ))}
          </div>
          <label className="toggle"><input type="checkbox" checked={skipKnown} onChange={event => setSkipKnown(event.target.checked)} /><span className="toggle-track"><motion.span className="toggle-knob" layout transition={spring} /></span>Skip known</label>
          <label className="toggle"><input type="checkbox" checked={Boolean(autoplay)} onChange={event => setAutoplay(event.target.checked)} /><span className="toggle-track"><motion.span className="toggle-knob" layout transition={spring} /></span>Auto-play audio</label>
          <button type="button" className="btn small" onClick={build}>Shuffle ↻</button>
        </div>
      </div>

      <div className="deck-area">
        <div className="deck-count mono">
          <span className="keep-count">← {tally.keep} learning</span>
          <span>{word ? `${index + 1} / ${deck.length}` : ""}</span>
          <span className="got-count">{tally.got} got it →</span>
        </div>
        <div className="deck">
          {deck.length === 0 ? (
            <div className="empty">{selected.size ? "Every word in these lessons is starred as known. Turn off “Skip known” to review them." : "Pick at least one lesson above."}</div>
          ) : word ? (
            <>
              {deck.slice(index + 1, index + 3).reverse().map((item, stackIndex, arr) => (
                <motion.div key={item.id} className="stack-card sheet" animate={{ y: (arr.length - stackIndex) * 10, scale: 1 - (arr.length - stackIndex) * 0.04, rotate: (arr.length - stackIndex) * (stackIndex % 2 ? 1.5 : -1.5) }} transition={spring} />
              ))}
              <AnimatePresence mode="popLayout">
                <SwipeCard key={word.id} word={word} dir={dir} flipped={flipped} setFlipped={setFlipped} onSwipe={swipe} autoplay={autoplay} />
              </AnimatePresence>
            </>
          ) : (
            <motion.div className="deck-done sheet" initial={{ scale: 0.8, opacity: 0, rotate: -3 }} animate={{ scale: 1, opacity: 1, rotate: -1 }} transition={spring}>
              <Ar className="deck-done-ar">أحسنت!</Ar>
              <h2 className="h2">Deck finished.</h2>
              <p className="muted">{tally.got} got it · {tally.keep} still learning · {remaining} left</p>
              <button type="button" className="btn primary" onClick={build}>Go again</button>
            </motion.div>
          )}
        </div>
        {word && (
          <div className="deck-actions">
            <motion.button type="button" className="round-btn keep" onClick={() => flingTop(-1)} whileHover={{ scale: 1.08, rotate: -8 }} whileTap={{ scale: 0.9 }} aria-label="Still learning">✕</motion.button>
            <motion.button type="button" className="round-btn flip-btn" onClick={() => setFlipped(value => !value)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9, rotate: 180 }} aria-label="Flip">↻</motion.button>
            <motion.button type="button" className="round-btn got" onClick={() => flingTop(1)} whileHover={{ scale: 1.08, rotate: 8 }} whileTap={{ scale: 0.9 }} aria-label="Got it">★</motion.button>
          </div>
        )}
        <p className="mono muted deck-help">Drag the card · space flips · ← still learning · → got it · P plays audio</p>
      </div>
      <Confetti fire={celebrate} />
    </div>
  );
}
