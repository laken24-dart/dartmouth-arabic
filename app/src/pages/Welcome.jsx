import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { checkEmail, login, signup, useAuthConfig, useSession } from "../lib/auth";
import SsoButton from "../components/SsoButton";
import { ALL_WORDS } from "../data/vocab";
import { shuffle } from "../lib/curriculum";
import { softSpring, spring } from "../components/ui";

function FloatingWord({ word, index, mx, my }) {
  const depth = 0.4 + (index % 5) * 0.28;
  const x = useTransform(mx, value => value * 38 * depth);
  const y = useTransform(my, value => value * 30 * depth);
  const left = `${(index * 37) % 88 + 4}%`;
  const top = `${(index * 53) % 82 + 6}%`;
  return (
    <motion.span
      className="float-word"
      style={{ left, top, x, y, fontSize: 15 + depth * 15, opacity: 0.18 + depth * 0.22 }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 0.18 + depth * 0.22, scale: 1, rotate: [0, index % 2 ? 4 : -4, 0] }}
      transition={{ delay: 0.6 + index * 0.04, duration: 0.8, rotate: { duration: 6 + index % 4, repeat: Infinity, ease: "easeInOut" } }}
    >
      <span className="ar">{word.ar.split("/")[0]}</span>
    </motion.span>
  );
}

/** Shown when the page can't reach the backend (server not started, or the HTML file was opened directly). */
function ServerOffline() {
  const fromFile = window.location.protocol === "file:";
  return (
    <div className="offline-note" role="alert">
      <strong>{fromFile ? "Open the site through its server, not the file." : "Can’t reach the site’s server."}</strong>
      <span>{fromFile
        ? "This page was opened straight from the folder, so sign-in can’t work. Start the server (npm start) and visit http://localhost:8787 instead."
        : "Sign-in needs the backend running. On your computer, run npm start (or npm run dev:server) and reload this page."}</span>
    </div>
  );
}

export default function Welcome() {
  const session = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [busyEmail, setBusyEmail] = useState(false);
  const [params] = useSearchParams();
  const config = useAuthConfig();
  const [message, setMessage] = useState(() => params.get("sso_error") || "");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const words = useMemo(() => shuffle(ALL_WORDS.filter(word => word.ar.length < 12)).slice(0, 22), []);
  const mx = useSpring(useMotionValue(0), softSpring);
  const my = useSpring(useMotionValue(0), softSpring);

  if (session && !leaving) return <Navigate to="/" replace />;

  const enter = () => {
    setLeaving(true);
    setTimeout(() => navigate("/"), 650);
  };

  const submitEmail = async event => {
    event.preventDefault();
    const clean = email.trim().toLowerCase();
    setEmail(clean);
    setMessage("");
    setBusyEmail(true);
    try {
      const { exists } = await checkEmail(clean);
      setStep(exists ? "signin" : "create");
    } catch (error) { setMessage(error.message); }
    finally { setBusyEmail(false); }
  };

  const submitSignin = async event => {
    event.preventDefault();
    setBusy(true);
    setLeaving(true);
    try { await login({ email, password: String(new FormData(event.currentTarget).get("password")) }); enter(); }
    catch (error) { setLeaving(false); setMessage(error.message); }
    finally { setBusy(false); }
  };

  const submitCreate = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (values.get("password") !== values.get("confirm")) { setMessage("Those passwords don’t match."); return; }
    setBusy(true);
    setLeaving(true);
    try { await signup({ name: String(values.get("name")).trim(), email, password: String(values.get("password")) }); enter(); }
    catch (error) { setLeaving(false); setMessage(error.message); }
    finally { setBusy(false); }
  };

  const panel = { initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -40 }, transition: spring };

  return (
    <motion.div className="welcome" animate={leaving ? { opacity: 0, scale: 0.98 } : { opacity: 1 }} transition={{ duration: 0.5 }}>
      <section
        className="welcome-art"
        onPointerMove={event => {
          const box = event.currentTarget.getBoundingClientRect();
          mx.set((event.clientX - box.left) / box.width - 0.5);
          my.set((event.clientY - box.top) / box.height - 0.5);
        }}
        aria-hidden="true"
      >
        {words.map((word, index) => <FloatingWord key={word.id} word={word} index={index} mx={mx} my={my} />)}
        <div className="welcome-hello">
          <motion.div className="ar welcome-ahlan" initial={{ clipPath: "inset(0 0 0 100%)" }} animate={{ clipPath: "inset(0 0 0 0%)" }} transition={{ duration: 1.2, ease: [0.7, 0, 0.2, 1], delay: 0.2 }}>
            أهلاً وسهلاً
          </motion.div>
          <motion.p className="welcome-translit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}>
            <em>ahlan wa sahlan</em> — welcome, make yourself at home
          </motion.p>
        </div>
        <motion.div className="welcome-seal" initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...spring, delay: 0.5 }}>
          <svg viewBox="0 0 120 120" width="120" height="120">
            <defs><path id="circle" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" /></defs>
            <motion.g animate={{ rotate: 360 }} transition={{ duration: 24, repeat: Infinity, ease: "linear" }} style={{ transformOrigin: "60px 60px" }}>
              <text fontFamily="IBM Plex Mono" fontSize="9.5" letterSpacing="3.2" fill="currentColor"><textPath href="#circle">DARTMOUTH · ARABIC · EST. 1769 · </textPath></text>
            </motion.g>
            <text x="60" y="74" textAnchor="middle" fontFamily="Amiri" fontSize="40" fill="currentColor">د</text>
          </svg>
        </motion.div>
      </section>

      <section className="welcome-form">
        <motion.div className="welcome-brand" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <span className="seal">د</span>
          <span className="wordmark-text">Dartmouth Arabic<small>Language trainer</small></span>
        </motion.div>
        <div className="welcome-stage">
          <AnimatePresence mode="wait">
            {step === "email" && config && (
              <motion.div key="email" {...panel} className="welcome-step">
                <p className="mono kicker">Who’s studying?</p>
                <h1 className="h2">Sign in to start <em className="serif-em">today’s page.</em></h1>
                {config.offline && <ServerOffline />}
                {config.sso?.enabled && <SsoButton label={config.sso.label} />}
                {config.sso?.enabled && config.passwordLogin && <div className="or-rule"><span className="mono">or use email</span></div>}
                {config.passwordLogin && (
                  <form onSubmit={submitEmail} className="welcome-step">
                    <label className="field"><span>Dartmouth email</span>
                      <input className="input" type="email" required autoFocus={!config.sso?.enabled} autoComplete="email" placeholder="you@dartmouth.edu" value={email} onChange={event => setEmail(event.target.value)} />
                    </label>
                    <button className="btn primary" type="submit" disabled={busyEmail}>{busyEmail ? "Checking…" : <>Continue <span className="arrow">→</span></>}</button>
                  </form>
                )}
                <p className="form-msg" role="status">{message}</p>
              </motion.div>
            )}
            {step === "signin" && (
              <motion.form key="signin" {...panel} onSubmit={submitSignin} className="welcome-step">
                <p className="mono kicker">Step 02 — welcome back</p>
                <h1 className="h2">Welcome <em className="serif-em">back.</em></h1>
                <p className="muted">Signing in as <strong>{email}</strong></p>
                <label className="field"><span>Password</span><input className="input" name="password" type="password" required minLength={8} autoFocus autoComplete="current-password" /></label>
                <p className="form-msg" role="status">{message}</p>
                <div className="welcome-actions">
                  <button className="btn primary" type="submit" disabled={busy}>{busy ? "Checking…" : <>Sign in <span className="arrow">→</span></>}</button>
                  <button className="link" type="button" onClick={() => setStep("email")}>Use a different email</button>
                </div>
              </motion.form>
            )}
            {step === "create" && (
              <motion.form key="create" {...panel} onSubmit={submitCreate} className="welcome-step">
                <p className="mono kicker">Step 02 — new here</p>
                <h1 className="h2">Let’s make your <em className="serif-em">account.</em></h1>
                <p className="muted">No account yet for <strong>{email}</strong>. Any progress already saved on this browser comes with you.</p>
                <label className="field"><span>Your name</span><input className="input" name="name" required autoFocus autoComplete="name" /></label>
                <div className="two-col">
                  <label className="field"><span>Password</span><input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
                  <label className="field"><span>Confirm</span><input className="input" name="confirm" type="password" required minLength={8} autoComplete="new-password" /></label>
                </div>
                <p className="form-msg" role="status">{message}</p>
                <div className="welcome-actions">
                  <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : <>Create account <span className="arrow">→</span></>}</button>
                  <button className="link" type="button" onClick={() => setStep("email")}>Use a different email</button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
        <div className="welcome-foot">
          <p className="muted">Your account and progress are saved securely, so you can sign in from any computer.</p>
          <Link to="/teach/login" className="link">Instructor? Teacher platform →</Link>
        </div>
      </section>
    </motion.div>
  );
}
