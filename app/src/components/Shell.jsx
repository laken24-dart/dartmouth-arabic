import { useRef, useState } from "react";
import { NavLink, Link, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { logout, useSession } from "../lib/auth";
import { Modal, SpeakButton, spring } from "./ui";
import { KEYS, useStored } from "../lib/storage";
import { setAzureVoice, setRate, useTtsInfo, azureVoiceId } from "../lib/speech";
import DaalPanel from "./DaalPanel";

export const NAV = [
  { to: "/", label: "Today", end: true },
  { to: "/path", label: "The path" },
  { to: "/words", label: "Words" },
  { to: "/cards", label: "Cards" },
  { to: "/quiz", label: "Quiz" },
  { to: "/grammar", label: "Grammar" }
];

// Keeps the outgoing page rendered while it animates out.
function FrozenOutlet() {
  const outlet = useOutlet();
  const frozen = useRef(outlet);
  return frozen.current;
}

export default function Shell() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const initial = (session?.name || "?").trim().slice(0, 1).toUpperCase();
  const tts = useTtsInfo();
  const [ttsVoice] = useStored(KEYS.ttsVoice, null);
  const [rate] = useStored(KEYS.rate, "0.85");

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="wordmark" aria-label="Dartmouth Arabic home">
            <motion.span className="seal" whileHover={{ rotate: -12 }} transition={spring}>د</motion.span>
            <span className="wordmark-text">Dartmouth Arabic<small>Alif Baa → Al-Kitaab I</small></span>
          </Link>
          <nav className="nav" aria-label="Main">
            {NAV.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive && <motion.span layoutId="nav-ink" className="nav-ink" transition={spring} />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <button type="button" className="account-btn" onClick={() => setAccountOpen(true)} aria-label={`Account: ${session?.name || "Guest"}`}>
            <span className="avatar">{initial}</span>
            <span className="name">{session?.name?.split(" ")[0]}</span>
          </button>
          <button type="button" className="menu-btn" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <svg width="18" height="12" viewBox="0 0 18 12"><path d="M0 1h18M0 6h18M0 11h12" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            className="mobile-menu"
            aria-label="Menu"
            initial={{ clipPath: "circle(0% at 92% 4%)" }}
            animate={{ clipPath: "circle(150% at 92% 4%)" }}
            exit={{ clipPath: "circle(0% at 92% 4%)" }}
            transition={{ duration: 0.55, ease: [0.7, 0, 0.2, 1] }}
          >
            <button type="button" className="mobile-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button>
            {[...NAV, { to: "/teach", label: "Teach" }].map((item, index) => (
              <motion.div key={item.to} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 + index * 0.05, ...spring }}>
                <Link to={item.to} onClick={() => setMenuOpen(false)}><span>{String(index + 1).padStart(2, "0")}</span>{item.label}</Link>
              </motion.div>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <FrozenOutlet />
        </motion.main>
      </AnimatePresence>

      <footer className="footer">
        <div className="footer-inner">
          <span className="ar footer-ar">العربية كل يوم</span>
          <span className="mono">Dartmouth Arabic Language Trainer · progress is saved in this browser</span>
          <Link to="/teach" className="link">Instructor platform →</Link>
        </div>
      </footer>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} label="Your account">
        <p className="mono kicker">Learner profile</p>
        <h2 className="h2">{session?.name}</h2>
        <p className="muted" style={{ margin: "8px 0 22px" }}>{session?.email}</p>
        <section className="tts-settings">
          <p className="mono kicker">Pronunciation</p>
          {tts?.provider === "azure" ? (
            <label className="field"><span>Voice · Modern Standard Arabic</span>
              <select className="select" value={ttsVoice || azureVoiceId() || ""} onChange={event => setAzureVoice(event.target.value)}>
                {tts.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
              </select>
            </label>
          ) : <p className="muted" style={{ margin: 0, fontSize: 14 }}>Using your browser’s built-in Arabic voice.</p>}
          <div className="tts-row">
            <div className="seg" role="radiogroup" aria-label="Speaking speed">
              {[["0.7", "Slow"], ["0.85", "Normal"], ["1", "Fast"]].map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={String(rate) === value} onClick={() => setRate(value)}>
                  {String(rate) === value && <motion.span layoutId="seg-rate" className="seg-fill" transition={spring} />}<span>{label}</span>
                </button>
              ))}
            </div>
            <SpeakButton text="أهلاً وسهلاً في جامعة دارتموث" label="Test the voice" />
            <span className="ar tts-sample">أهلاً وسهلاً في جامعة دارتموث</span>
          </div>
        </section>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={() => setAccountOpen(false)}>Done</button>
          <button type="button" className="btn ghost" onClick={async () => { setAccountOpen(false); await logout(); navigate("/welcome"); }}>Sign out</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 22 }}>Your progress is saved to your account, so you can pick up on any computer.</p>
      </Modal>

      <DaalPanel />
    </>
  );
}
