import { motion } from "framer-motion";

const ROWS = [
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د"],
  ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط", "ذ"],
  ["ء", "ئ", "ؤ", "ر", "ى", "ة", "و", "ز", "ظ", "أ", "إ", "آ"]
];
const MARKS = [["َ", "fatḥa"], ["ُ", "ḍamma"], ["ِ", "kasra"], ["ْ", "sukūn"], ["ّ", "shadda"], ["ً", "tanwīn"], ["،", "comma"], ["؟", "question mark"]];

/** On-screen Arabic keyboard for students without an Arabic layout installed. */
export default function ArabicKeyboard({ onKey, onBackspace }) {
  return (
    <motion.div className="ar-keyboard" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} role="group" aria-label="Arabic keyboard">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="ar-keyboard-row" dir="rtl">
          {row.map(letter => <button key={letter} type="button" lang="ar" onMouseDown={event => event.preventDefault()} onClick={() => onKey(letter)}>{letter}</button>)}
        </div>
      ))}
      <div className="ar-keyboard-row marks" dir="rtl">
        {MARKS.map(([mark, name]) => <button key={mark} type="button" lang="ar" title={name} aria-label={name} onMouseDown={event => event.preventDefault()} onClick={() => onKey(mark)}>{mark === "،" || mark === "؟" ? mark : `ـ${mark}`}</button>)}
        <button type="button" className="wide" onMouseDown={event => event.preventDefault()} onClick={() => onKey(" ")}>space</button>
        <button type="button" aria-label="Delete" onMouseDown={event => event.preventDefault()} onClick={onBackspace}>⌫</button>
      </div>
    </motion.div>
  );
}
