import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { isSpeaking, onSpeakingChange } from "../lib/speech";

/*
 * Daal (دال) — the site's tutor: the Arabic letter د itself, with eyes, brows and a mouth on its bend.
 * moods: idle · happy · encourage · thinking · talking · celebrate · surprised · wave
 * Eyes follow the pointer, Daal blinks, and the mouth moves whenever Arabic audio plays.
 */

// The letter: head at the top, steep stroke down to the bend, flat base sweeping left to an upturned tail.
const LETTER = "M62 18 C72 30 90 50 93 72 C95 90 87 96 68 96 L36 96 C27 96 22 93 19 85";
const EYES = [86, 106];

// Mouth shapes share one command structure ("M x y Q cx cy x y") so Framer can morph between them.
const MOUTHS = {
  idle: "M85 83 Q96 94 107 83",
  happy: "M83 81 Q96 99 109 81",
  encourage: "M87 86 Q96 90 105 86",
  thinking: "M88 87 Q94 86 103 88",
  surprised: "M91 85 Q96 95 101 85",
  celebrate: "M82 80 Q96 101 110 80",
  wave: "M84 82 Q96 96 108 82"
};
const BROWS = {
  idle: ["M78 49 Q85 43 93 47", "M99 47 Q107 43 114 49"],
  happy: ["M78 47 Q85 41 93 45", "M99 45 Q107 41 114 47"],
  encourage: ["M78 47 Q85 46 93 50", "M99 50 Q107 46 114 47"],
  thinking: ["M78 45 Q85 39 93 43", "M99 50 Q107 49 114 51"],
  surprised: ["M78 43 Q85 36 93 41", "M99 41 Q107 36 114 43"],
  celebrate: ["M78 46 Q85 40 93 44", "M99 44 Q107 40 114 46"],
  wave: ["M78 48 Q85 42 93 46", "M99 46 Q107 42 114 48"]
};
const BODY = {
  idle: { y: [0, -3, 0], rotate: 0, scaleY: 1, transition: { y: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } } },
  happy: { y: [0, -14, 0, -6, 0], scaleY: [1, 0.94, 1.04, 1], rotate: [0, -4, 4, 0], transition: { duration: 0.8 } },
  encourage: { y: 0, rotate: [-2, -7, -5], scaleY: 1, transition: { duration: 0.6 } },
  thinking: { y: [0, -2, 0], rotate: 5, scaleY: 1, transition: { y: { duration: 2.4, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: 0.4 } } },
  talking: { y: [0, -2, 0], rotate: 0, scaleY: 1, transition: { y: { duration: 0.6, repeat: Infinity } } },
  surprised: { y: [0, -8, 0], scaleY: [1, 1.08, 1], transition: { duration: 0.45 } },
  celebrate: { y: [0, -26, 0, -12, 0], scaleY: [1, 0.9, 1.06, 1], rotate: [0, -10, 10, -6, 0], transition: { duration: 1.1 } },
  wave: { y: [0, -6, 0], rotate: [0, 8, -6, 8, 0], scaleY: 1, transition: { duration: 1.2 } }
};

function usePointerGaze(enabled) {
  const x = useSpring(useMotionValue(0), { stiffness: 180, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 180, damping: 18 });
  useEffect(() => {
    if (!enabled) return undefined;
    const move = event => {
      x.set((event.clientX / window.innerWidth - 0.5) * 6);
      y.set((event.clientY / window.innerHeight - 0.5) * 4.5);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [enabled, x, y]);
  return { x, y };
}

export function useSpeakingNow() {
  const [speaking, setSpeaking] = useState(isSpeaking());
  useEffect(() => onSpeakingChange(setSpeaking), []);
  return speaking;
}

export default function Daal({ mood = "idle", size = 96, talking = false, track = true, title = "Daal" }) {
  const id = useId().replace(/:/g, "");
  const speaking = useSpeakingNow();
  const isTalking = talking || speaking;
  const face = mood === "talking" ? "idle" : mood;
  const gaze = usePointerGaze(track && mood !== "thinking");
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    let timer;
    const loop = () => {
      timer = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); loop(); }, 2600 + Math.random() * 2600);
    };
    loop();
    return () => clearTimeout(timer);
  }, []);

  const happyEyes = face === "happy" || face === "celebrate";
  const eyeScale = blink ? 0.1 : face === "surprised" ? 1.2 : 1;
  const pupilOffset = face === "thinking" ? { x: -2.5, y: -3.5 } : null;
  const [browLeft, browRight] = BROWS[face] || BROWS.idle;
  const mouth = MOUTHS[face] || MOUTHS.idle;

  return (
    <motion.svg
      className="daal-character"
      viewBox="0 0 130 125"
      width={size}
      height={size * 125 / 130}
      role="img"
      aria-label={title}
      animate={BODY[isTalking && mood === "idle" ? "talking" : mood] || BODY.idle}
      style={{ overflow: "visible", transformOrigin: "60px 118px" }}
    >
      <defs>
        <linearGradient id={`ink-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d6a49" />
          <stop offset="1" stopColor="#0c3a27" />
        </linearGradient>
      </defs>

      {/* shadow */}
      <motion.ellipse cx="62" cy="119" rx="46" ry="4" fill="rgba(21,36,28,.16)" animate={{ rx: mood === "celebrate" || mood === "happy" ? [46, 34, 46] : 46 }} transition={{ duration: 0.8 }} />

      {/* the letter د */}
      <path d={LETTER} fill="none" stroke={`url(#ink-${id})`} strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" />

      {/* eyes */}
      {EYES.map(cx => (
        <g key={cx}>
          {happyEyes ? (
            <motion.path d={`M${cx - 9} 65 Q${cx} 53 ${cx + 9} 65`} fill="none" stroke="#f3eee3" strokeWidth="4" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25 }} />
          ) : (
            <motion.g animate={{ scaleY: eyeScale }} transition={{ duration: 0.08 }} style={{ transformOrigin: `${cx}px 62px` }}>
              <circle cx={cx} cy="62" r="10" fill="#fbf8f1" />
              <motion.g style={pupilOffset ? undefined : { x: gaze.x, y: gaze.y }} animate={pupilOffset || {}}>
                <circle cx={cx + 1.2} cy="63" r="5" fill="#15241c" />
                <circle cx={cx + 3} cy="60.6" r="1.7" fill="#fff" />
              </motion.g>
            </motion.g>
          )}
        </g>
      ))}

      {/* brows */}
      <motion.path d={browLeft} animate={{ d: browLeft }} fill="none" stroke="#f3eee3" strokeWidth="3.6" strokeLinecap="round" />
      <motion.path d={browRight} animate={{ d: browRight }} fill="none" stroke="#f3eee3" strokeWidth="3.6" strokeLinecap="round" />

      {/* mouth: morphs by mood, opens and closes while talking */}
      {isTalking ? (
        <motion.ellipse cx="96" cy="86" rx="7" fill="#15241c" stroke="#f3eee3" strokeWidth="1.5" animate={{ ry: [2, 6.5, 3, 7, 2] }} transition={{ duration: 0.55, repeat: Infinity }} />
      ) : (
        <motion.path d={mouth} animate={{ d: mouth }} transition={{ duration: 0.3 }} fill={happyEyes ? "#15241c" : "none"} stroke="#f3eee3" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* thinking dots / celebration sparks */}
      <AnimatePresence>
        {mood === "thinking" && [0, 1, 2].map(index => (
          <motion.circle key={`dot${index}`} cx={112 + index * 7} cy={34 - index * 8} r={2 + index} fill="#b8892f"
            initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0.3, 1, 0.3], scale: 1 }} exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1.2, repeat: Infinity, delay: index * 0.2 }, scale: { duration: 0.2 } }} />
        ))}
        {(mood === "celebrate" || mood === "happy") && [0, 1, 2, 3, 4].map(index => (
          <motion.path key={`spark${index}`} d="M0 -5 L1.5 -1.5 L5 0 L1.5 1.5 L0 5 L-1.5 1.5 L-5 0 L-1.5 -1.5 Z" fill={index % 2 ? "#c2412b" : "#b8892f"}
            initial={{ x: 80, y: 60, scale: 0, opacity: 1 }}
            animate={{ x: 70 + Math.cos(index * 1.26) * 66, y: 58 + Math.sin(index * 1.26) * 54, scale: [0, 1.4, 0.8], opacity: [1, 1, 0] }}
            exit={{ opacity: 0 }} transition={{ duration: 0.9, delay: index * 0.04 }} />
        ))}
      </AnimatePresence>
    </motion.svg>
  );
}
