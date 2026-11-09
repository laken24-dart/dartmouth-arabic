import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthConfig } from "../lib/auth";
import { KEYS, read, write } from "../lib/storage";
import { onOpenDaal, streamDaal } from "../lib/daal";
import Daal from "./Daal";
import DaalText from "./DaalText";
import ArabicKeyboard from "./ArabicKeyboard";
import { spring } from "./ui";

const MODES = [
  { id: "ask", label: "Ask", hint: "Ask Daal anything about Arabic…", intro: "Ask me anything — a word, a grammar rule, how to say something, or why an answer was wrong.",
    starters: ["What’s the difference between ما and ماذا?", "How do I say “I study in the library”?", "Explain the iḍāfa with an example", "When do I use ليس?"] },
  { id: "converse", label: "Talk", hint: "Reply in Arabic (English is fine if you’re stuck)…", intro: "Let’s practice speaking. Pick a scene and I’ll start the conversation in Arabic at your level.",
    scenarios: ["Ordering coffee at Collis", "Meeting your new roommate", "Office hours with your professor", "Asking the way to Baker Library", "Chatting before class on the Green"] },
  { id: "check", label: "Check", hint: "Paste or type a sentence you wrote in Arabic…", intro: "Write something in Arabic and I’ll correct it, explain the fixes, and tell you what you did well.",
    starters: ["أنا طالب في جامعة دارتموث", "أسكن في السكن مع زميلي", "هي طالبة جديد"] },
  { id: "quiz", label: "Quiz me", hint: "Your answer…", intro: "I’ll quiz you one question at a time on what you’ve studied and keep score.",
    starters: ["Quiz me on my current unit", "Quiz me on verbs", "Quiz me on question words", "Quiz me on numbers"] }
];

const TOUR = [
  { to: "/", title: "Today", text: "Your home page. It always shows your next step and how far you’ve come." },
  { to: "/path", title: "The path", text: "The course, day by day. Lesson days teach ten words; homework days bring them back. Pass each checkpoint (75%) to unlock the next unit — I’ll be there quizzing you." },
  { to: "/words", title: "Words", text: "Every word in the course. Search, listen, and star the ones you know." },
  { to: "/cards", title: "Cards", text: "Flip a card, then swipe right if you knew it or left to keep practicing." },
  { to: "/grammar", title: "Grammar", text: "Pronouns, question words, negation and more. And whenever you’re confused, open me and ask." }
];

const HISTORY_KEY = "dalt-daal-chats-v1";
const loadChats = () => { try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "{}"); } catch { return {}; } };

export default function DaalPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const config = useAuthConfig();
  const aiOn = Boolean(config?.daal?.enabled);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("ask");
  const [chats, setChats] = useState(loadChats);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [keyboard, setKeyboard] = useState(false);
  const [tour, setTour] = useState(-1);
  const [greeting, setGreeting] = useState(false);
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const messages = chats[mode] || [];
  const modeInfo = MODES.find(item => item.id === mode);

  useEffect(() => { try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(chats)); } catch { /* ignore */ } }, [chats]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [chats, mode, busy]);

  // First visit: Daal waves hello and offers the tour.
  useEffect(() => {
    const seen = read(KEYS.guideIntroduced, null);
    if (location.pathname === "/" && seen !== "1" && seen !== 1) {
      const timer = setTimeout(() => setGreeting(true), 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [location.pathname]);

  const send = useCallback(async (text, sendMode = mode, scenario) => {
    const content = String(text || "").trim();
    if (!content || busy) return;
    setError("");
    setDraft("");
    const history = [...(chats[sendMode] || []), { role: "user", content }];
    setChats(current => ({ ...current, [sendMode]: [...history, { role: "assistant", content: "", streaming: true }] }));
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let reply = "";
    const update = streaming => setChats(current => {
      const list = [...(current[sendMode] || [])];
      list[list.length - 1] = { role: "assistant", content: reply, streaming };
      return { ...current, [sendMode]: list };
    });
    try {
      await streamDaal({
        mode: sendMode,
        messages: history.map(({ role, content: body }) => ({ role, content: body })),
        scenario,
        signal: controller.signal,
        onText: delta => { reply += delta; update(true); },
        onReset: () => { reply = ""; update(true); }
      });
      update(false);
    } catch (problem) {
      if (problem.name === "AbortError") { reply = reply || "(stopped)"; update(false); }
      else {
        setChats(current => ({ ...current, [sendMode]: (current[sendMode] || []).filter(item => !(item.role === "assistant" && item.streaming)) }));
        setError(problem.message);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, chats, mode]);

  // Other screens (lesson players, quizzes) can open Daal in a mode, with a draft or a message to send.
  useEffect(() => onOpenDaal(options => {
    setOpen(true);
    setTour(-1);
    if (options.mode) setMode(options.mode);
    if (options.draft) setDraft(options.draft);
    if (options.send) setTimeout(() => send(options.send, options.mode || "ask"), 50);
  }), [send]);

  useEffect(() => { if (open && tour < 0) setTimeout(() => inputRef.current?.focus(), 250); }, [open, mode, tour]);

  const insert = character => {
    const input = inputRef.current;
    if (!input) { setDraft(value => value + character); return; }
    const start = input.selectionStart ?? draft.length;
    const end = input.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + character + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + character.length, start + character.length); });
  };
  const backspace = () => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    if (start !== end) setDraft(draft.slice(0, start) + draft.slice(end));
    else if (start > 0) setDraft(draft.slice(0, start - 1) + draft.slice(start));
    requestAnimationFrame(() => { input?.focus(); const at = Math.max(0, start === end ? start - 1 : start); input?.setSelectionRange(at, at); });
  };

  const finishTour = () => { write(KEYS.guideIntroduced, "1"); setTour(-1); setGreeting(false); };
  const goTour = index => { setTour(index); setOpen(true); navigate(TOUR[index].to); };

  const lastAssistant = messages.at(-1);
  const daalMood = busy && !lastAssistant?.content ? "thinking" : busy ? "idle" : error ? "encourage" : open ? "happy" : "idle";

  return (
    <div className="daal-dock">
      <AnimatePresence>
        {greeting && !open && (
          <motion.div className="daal-greet sheet" initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={spring}>
            <p><strong lang="ar" className="ar">أهلاً!</strong> I’m Daal, your Arabic tutor. I’ll quiz you in lessons, and you can ask me anything. Want a quick tour?</p>
            <div className="daal-greet-actions">
              <button type="button" className="btn small primary" onClick={() => goTour(0)}>Show me around</button>
              <button type="button" className="btn small ghost" onClick={finishTour}>Later</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section className="daal-panel sheet" role="dialog" aria-label="Daal, your Arabic tutor"
            initial={{ opacity: 0, y: 30, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.96 }} transition={spring}
            style={{ transformOrigin: "bottom right" }}>
            <header className="daal-panel-head">
              <Daal mood={daalMood} talking={busy && Boolean(lastAssistant?.content)} size={62} />
              <div className="daal-panel-title"><strong>Daal <span className="ar">دال</span></strong><span className="mono muted">{aiOn ? "Your Arabic tutor" : "Your guide"}</span></div>
              <button type="button" className="dialog-close" aria-label="Close Daal" onClick={() => { setOpen(false); abortRef.current?.abort(); }}>×</button>
            </header>

            {tour >= 0 ? (
              <AnimatePresence mode="wait">
                <motion.div key={tour} className="daal-tour" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <p className="mono" style={{ color: "var(--stamp)" }}>{tour + 1} / {TOUR.length} · {TOUR[tour].title}</p>
                  <p className="daal-tour-text">{TOUR[tour].text}</p>
                  <div className="daal-greet-actions">
                    {tour < TOUR.length - 1
                      ? <button type="button" className="btn small primary" onClick={() => goTour(tour + 1)}>Next <span className="arrow">→</span></button>
                      : <button type="button" className="btn small primary" onClick={() => { finishTour(); navigate("/"); }}>Start learning</button>}
                    <button type="button" className="btn small ghost" onClick={finishTour}>Exit tour</button>
                  </div>
                </motion.div>
              </AnimatePresence>
            ) : (
              <>
                <nav className="seg daal-modes" role="tablist" aria-label="Daal’s tools">
                  {MODES.map(item => (
                    <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} onClick={() => { setMode(item.id); setError(""); }}>
                      {mode === item.id && <motion.span layoutId="daal-mode" className="seg-fill" transition={spring} />}<span>{item.label}</span>
                    </button>
                  ))}
                </nav>

                <div className="daal-thread" ref={scrollRef} aria-live="polite">
                  {!aiOn && config && (
                    <div className="daal-msg daal"><DaalText text={"My AI tutoring isn’t switched on yet — an administrator needs to add **ANTHROPIC_API_KEY** to the server. I can still show you around the site."} /></div>
                  )}
                  {messages.length === 0 && aiOn && (
                    <div className="daal-empty">
                      <div className="daal-msg daal"><DaalText text={modeInfo.intro} /></div>
                      <div className="daal-starters">
                        {(modeInfo.scenarios || modeInfo.starters).map(item => (
                          <motion.button key={item} type="button" className="daal-starter" whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                            onClick={() => (modeInfo.scenarios ? send(`Let’s practice: ${item}. You start.`, "converse", item) : send(item))}
                            dir="auto">{item}</motion.button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((message, index) => (
                    <motion.div key={index} className={`daal-msg ${message.role === "user" ? "me" : "daal"}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      {message.role === "user" ? <p dir="auto">{message.content}</p> : message.content ? <DaalText text={message.content} /> : <span className="daal-typing"><i /><i /><i /></span>}
                    </motion.div>
                  ))}
                  {error && <p className="form-msg daal-error" role="alert">{error}</p>}
                </div>

                <form className="daal-compose" onSubmit={event => { event.preventDefault(); send(draft); }}>
                  <AnimatePresence>{keyboard && <ArabicKeyboard onKey={insert} onBackspace={backspace} />}</AnimatePresence>
                  <div className="daal-compose-row">
                    <button type="button" className={`daal-kb-toggle${keyboard ? " on" : ""}`} aria-pressed={keyboard} title="Arabic keyboard" onClick={() => setKeyboard(value => !value)} lang="ar">ع</button>
                    <textarea ref={inputRef} rows={1} value={draft} dir="auto" placeholder={aiOn ? modeInfo.hint : "Daal’s AI is off"} disabled={!aiOn}
                      onChange={event => setDraft(event.target.value)}
                      onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(draft); } }} />
                    {busy
                      ? <button type="button" className="btn small" onClick={() => abortRef.current?.abort()}>Stop</button>
                      : <button type="submit" className="btn small primary" disabled={!aiOn || !draft.trim()}>Send</button>}
                  </div>
                  <div className="daal-compose-foot">
                    {messages.length > 0 && <button type="button" className="link" onClick={() => setChats(current => ({ ...current, [mode]: [] }))}>New chat</button>}
                    <button type="button" className="link" onClick={() => goTour(0)}>Tour the site</button>
                    <span className="mono muted">Daal can make mistakes — check with your instructor.</span>
                  </div>
                </form>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button type="button" className="daal-launcher" aria-label={open ? "Close Daal" : "Open Daal, your Arabic tutor"} aria-expanded={open}
        onClick={() => { setOpen(value => !value); setGreeting(false); }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }} transition={spring}>
        <Daal mood={greeting ? "wave" : open ? "happy" : "idle"} size={84} />
      </motion.button>
    </div>
  );
}
