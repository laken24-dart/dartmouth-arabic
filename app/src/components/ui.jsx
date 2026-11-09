import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { speak, speechSupported } from "../lib/speech";

export const spring = { type: "spring", stiffness: 420, damping: 32 };
export const softSpring = { type: "spring", stiffness: 180, damping: 22 };

export const Ar = ({ children, className = "", as: Tag = "span", ...rest }) => (
  <Tag lang="ar" dir="rtl" className={`ar ${className}`} {...rest}>{children}</Tag>
);

/** Speaker that shows live audio bars while the browser voice is talking. */
export function SpeakButton({ text, big = false, label = "Hear it", disabled = false }) {
  const [playing, setPlaying] = useState(false);
  if (!speechSupported) return null;
  return (
    <motion.button
      type="button"
      className={`speak${big ? " big" : ""}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      whileTap={{ scale: 0.88 }}
      onClick={event => { event.stopPropagation(); setPlaying(true); speak(text, { onEnd: () => setPlaying(false) }); }}
    >
      <span className="bars" aria-hidden="true">
        {[0, 1, 2, 3].map(index => (
          <motion.i
            key={index}
            animate={playing ? { height: [5, 15, 7, 13, 5] } : { height: [6, 9, 12, 8][index] }}
            transition={playing ? { duration: 0.7, repeat: Infinity, delay: index * 0.09 } : { duration: 0.2 }}
          />
        ))}
      </span>
    </motion.button>
  );
}

/** Number that counts up when scrolled into view. */
export function Counter({ value, suffix = "", duration = 1.1 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return undefined;
    const controls = animate(0, Number(value) || 0, { duration, ease: [0.2, 0.8, 0.2, 1], onUpdate: latest => setDisplay(Math.round(latest)) });
    return () => controls.stop();
  }, [inView, value, duration]);
  return <span ref={ref}>{display}{suffix}</span>;
}

/** Hand-drawn underline that draws itself in. */
export function Squiggle({ color = "var(--stamp)", delay = 0.4, width = 220 }) {
  return (
    <svg viewBox="0 0 220 18" width={width} height={18 * width / 220} aria-hidden="true" style={{ overflow: "visible" }}>
      <motion.path
        d="M3 12 C 30 3, 52 16, 80 9 S 130 3, 156 10 S 196 15, 217 6"
        fill="none"
        stroke={color}
        strokeWidth="3.2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay, ease: [0.6, 0, 0.2, 1] }}
      />
    </svg>
  );
}

/** Words split into staggered, rising pieces. */
export function RiseText({ text, className = "", delay = 0, as: Tag = "span" }) {
  const words = String(text).split(" ");
  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, index) => (
        <span key={index} aria-hidden="true" style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.08em" }}>
          <motion.span
            style={{ display: "inline-block" }}
            initial={{ y: "105%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.75, delay: delay + index * 0.07, ease: [0.2, 0.9, 0.1, 1] }}
          >
            {word}{index < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Infinite horizontal ticker. */
export function Marquee({ items, speed = 40, reverse = false }) {
  return (
    <div className="marquee" aria-hidden="true">
      <motion.div
        className="marquee-track"
        animate={{ x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
      >
        {[...items, ...items].map((item, index) => (
          <span className="marquee-item" key={index}>
            <span className="ar">{item.ar}</span>
            <span className="marquee-en">{item.en}</span>
            <span className="marquee-dot">✳</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/** Card that tilts toward the pointer. */
export function Tilt({ children, className = "", max = 7, ...rest }) {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(y, [0, 1], [max, -max]), softSpring);
  const rotateY = useSpring(useTransform(x, [0, 1], [-max, max]), softSpring);
  return (
    <motion.div
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={event => {
        const box = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - box.left) / box.width);
        y.set((event.clientY - box.top) / box.height);
      }}
      onPointerLeave={() => { x.set(0.5); y.set(0.5); }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Pulls gently toward the cursor. */
export function Magnetic({ children, strength = 0.25 }) {
  const x = useSpring(0, softSpring);
  const y = useSpring(0, softSpring);
  return (
    <motion.span
      style={{ x, y, display: "inline-block" }}
      onPointerMove={event => {
        const box = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - box.left - box.width / 2) * strength);
        y.set((event.clientY - box.top - box.height / 2) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.span>
  );
}

export function Modal({ open, onClose, children, label, className = "" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={`sheet dialog ${className}`}
            initial={{ y: 40, rotate: -1.5, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: 30, rotate: 1, opacity: 0 }}
            transition={spring}
          >
            <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>×</button>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const CONFETTI_GLYPHS = ["ا", "ب", "ت", "ج", "د", "ر", "س", "ع", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي", "✳", "●", "■"];
const CONFETTI_COLORS = ["var(--stamp)", "var(--forest)", "var(--ochre)", "var(--ink)", "var(--moss)"];

/** Burst of Arabic letters and paper bits. */
export function Confetti({ fire, count = 46 }) {
  const [pieces, setPieces] = useState([]);
  useEffect(() => {
    if (!fire) return undefined;
    setPieces(Array.from({ length: count }, (_, index) => ({
      id: `${fire}-${index}`,
      glyph: CONFETTI_GLYPHS[Math.floor(Math.random() * CONFETTI_GLYPHS.length)],
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      x: (Math.random() - 0.5) * Math.min(window.innerWidth, 900),
      y: -(220 + Math.random() * 320),
      rotate: (Math.random() - 0.5) * 720,
      size: 16 + Math.random() * 22,
      delay: Math.random() * 0.15
    })));
    const timer = setTimeout(() => setPieces([]), 2600);
    return () => clearTimeout(timer);
  }, [fire, count]);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map(piece => (
        <motion.span
          key={piece.id}
          className="confetti-piece"
          style={{ color: piece.color, fontSize: piece.size }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{ x: piece.x, y: [0, piece.y, piece.y + 700], opacity: [1, 1, 0], rotate: piece.rotate, scale: 1 }}
          transition={{ duration: 2.3, delay: piece.delay, ease: [0.15, 0.7, 0.4, 1], times: [0, 0.35, 1] }}
        >
          {piece.glyph}
        </motion.span>
      ))}
    </div>
  );
}

/** Animated circular score. */
export function ScoreRing({ percent, size = 170, pass = true }) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--paper-deep)" strokeWidth="10" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={pass ? "var(--forest)" : "var(--stamp)"}
          strokeWidth="10"
          strokeLinecap="butt"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - percent / 100) }}
          transition={{ duration: 1.3, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }}
          style={{ rotate: -90, transformOrigin: "50% 50%" }}
        />
      </svg>
      <div className="score-ring-label"><Counter value={percent} suffix="%" duration={1.3} /></div>
    </div>
  );
}

/** Rubber-stamp impression that slams onto the page. */
export function Stamp({ children, color = "var(--stamp)", rotate = -8 }) {
  return (
    <motion.div
      className="stamp-mark"
      style={{ color, borderColor: color }}
      initial={{ scale: 2.6, opacity: 0, rotate: rotate - 14 }}
      animate={{ scale: 1, opacity: 1, rotate }}
      transition={{ type: "spring", stiffness: 520, damping: 18, delay: 0.15 }}
    >
      {children}
    </motion.div>
  );
}

export function useKey(handler, deps = []) {
  useEffect(() => {
    const listener = event => {
      if (event.target.closest?.("input, textarea, select")) return;
      handler(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
