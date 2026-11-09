import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthConfig } from "../lib/auth";
import { openDaal, reaction, streamDaal } from "../lib/daal";
import Daal from "./Daal";
import DaalText from "./DaalText";
import { spring } from "./ui";

/**
 * Daal beside a question.
 *  line     – what Daal says before you answer
 *  result   – null | { correct, detail } once answered (detail feeds "Why?")
 *  streak   – consecutive correct answers (for bigger celebrations)
 *  mood     – optional override (e.g. "celebrate" on a results screen)
 */
export default function DaalCoach({ line, result = null, streak = 0, mood: forcedMood, compact = false }) {
  const config = useAuthConfig();
  const aiOn = Boolean(config?.daal?.enabled);
  const [say, setSay] = useState(line);
  const [mood, setMood] = useState(forcedMood || "idle");
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [problem, setProblem] = useState("");
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // New question: reset. Answered: react instantly.
  useEffect(() => {
    abortRef.current?.abort();
    setExplanation("");
    setProblem("");
    setExplaining(false);
    if (!result) { setSay(line); setMood(forcedMood || "idle"); return; }
    setSay(reaction(result.correct ? "correct" : "wrong", streak));
    setMood(result.correct ? (streak >= 3 ? "celebrate" : "happy") : "encourage");
  }, [result, line, streak, forcedMood]);

  const explain = async () => {
    if (!result?.detail || explaining) return;
    setExplaining(true);
    setExplanation("");
    setProblem("");
    setMood("thinking");
    const controller = new AbortController();
    abortRef.current = controller;
    let text = "";
    try {
      await streamDaal({
        mode: "explain",
        question: result.detail,
        signal: controller.signal,
        onText: delta => { text += delta; setExplanation(text); setMood("talking"); },
        onReset: () => { text = ""; setExplanation(""); }
      });
      setMood("happy");
    } catch (error) {
      if (error.name !== "AbortError") { setProblem(error.message); setMood("encourage"); }
    } finally {
      setExplaining(false);
    }
  };

  const followUp = () => {
    const detail = result?.detail || {};
    openDaal({ mode: "ask", draft: `About the question “${detail.prompt}” (answer: ${detail.correct}) — ` });
  };

  const talking = mood === "talking";
  return (
    <div className={`daal-coach${compact ? " compact" : ""}`}>
      <div className="daal-coach-figure"><Daal mood={talking ? "idle" : mood} talking={talking} size={compact ? 72 : 96} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={`${say}-${Boolean(explanation)}`} className="daal-bubble" initial={{ opacity: 0, x: -10, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0 }} transition={spring}>
          {explanation ? <DaalText text={explanation} /> : <DaalText text={say || ""} />}
          {problem && <p className="form-msg" style={{ margin: "6px 0 0" }}>{problem}</p>}
          {result && !result.correct && aiOn && !explanation && (
            <button type="button" className="daal-why" onClick={explain} disabled={explaining}>{explaining ? "Thinking…" : "Why? Ask Daal →"}</button>
          )}
          {explanation && !explaining && <button type="button" className="daal-why" onClick={followUp}>Ask a follow-up →</button>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
