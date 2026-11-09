import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { claimTeacher, login, logout, teacherSignup, useAuthConfig, useSession } from "../lib/auth";
import SsoButton from "../components/SsoButton";
import { RiseText, spring } from "../components/ui";

export default function TeacherLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin");
  const [params] = useSearchParams();
  const [message, setMessage] = useState(() => params.get("sso_error") || "");
  const [busy, setBusy] = useState(false);
  const session = useSession();
  const config = useAuthConfig();

  const claim = async event => {
    event.preventDefault();
    setBusy(true);
    try { await claimTeacher(String(new FormData(event.currentTarget).get("accessCode")).trim()); navigate("/teach"); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const signin = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    try { await login({ email: String(values.get("email")).trim(), password: String(values.get("password")), role: "teacher" }); navigate("/teach"); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const create = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (values.get("password") !== values.get("confirm")) { setMessage("Those passwords don’t match."); return; }
    setBusy(true);
    try {
      await teacherSignup({ name: String(values.get("name")).trim(), email: String(values.get("email")).trim(), password: String(values.get("password")), accessCode: String(values.get("accessCode")).trim() });
      navigate("/teach");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  if (session?.role === "teacher") return <Navigate to="/teach" replace />;

  return (
    <div className="teach-login">
      <div className="teach-login-inner">
        <Link to="/welcome" className="wordmark"><span className="seal">د</span><span className="wordmark-text">Dartmouth Arabic<small>Instructor platform</small></span></Link>
        <h1 className="display"><RiseText text="Teach the" /> <em><RiseText text="path." delay={0.1} /></em></h1>
        <p className="lede">Create classes, share a join code, publish lesson plans and homework, and see each learner’s progress.</p>
        {session ? (
          <motion.form className="teach-form claim-form" onSubmit={claim} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <p className="mono kicker">Signed in as {session.name}</p>
            <p className="muted" style={{ margin: 0 }}>To unlock instructor tools on this account, enter the access code from the Arabic program. You only do this once.</p>
            <label className="field"><span>Instructor access code</span><input className="input mono-input" name="accessCode" required autoFocus autoComplete="off" /></label>
            <p className="form-msg" role="status">{message}</p>
            <div className="welcome-actions">
              <button className="btn primary" type="submit" disabled={busy}>Unlock instructor tools <span className="arrow">→</span></button>
              <button type="button" className="link" onClick={() => logout()}>Not you? Sign out</button>
            </div>
          </motion.form>
        ) : config && (<>
        {config.sso?.enabled && <div style={{ margin: "30px 0 8px", maxWidth: 440 }}><SsoButton intent="teacher" label={config.sso.label} /></div>}
        {config.sso?.enabled && !config.passwordLogin && <p className="form-msg" role="status">{message}</p>}
        {config.passwordLogin && <>
        <div className="seg" role="tablist" style={{ margin: "30px 0 22px" }}>
          {[["signin", "Sign in"], ["create", "Create instructor profile"]].map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setMessage(""); }}>
              {mode === value && <motion.span layoutId="seg-teach" className="seg-fill" transition={spring} />}<span>{label}</span>
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.form key={mode} className="teach-form" onSubmit={mode === "signin" ? signin : create} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={spring}>
            {mode === "create" && <label className="field"><span>Full name</span><input className="input" name="name" required autoComplete="name" /></label>}
            <label className="field"><span>Dartmouth email</span><input className="input" name="email" type="email" required autoComplete="email" placeholder="name@dartmouth.edu" /></label>
            <label className="field"><span>Password</span><input className="input" name="password" type="password" minLength={8} required autoComplete={mode === "signin" ? "current-password" : "new-password"} /></label>
            {mode === "create" && <label className="field"><span>Confirm password</span><input className="input" name="confirm" type="password" minLength={8} required autoComplete="new-password" /></label>}
            {mode === "create" && <label className="field"><span>Instructor access code</span><input className="input mono-input" name="accessCode" required autoComplete="off" placeholder="From the department" /></label>}
            <p className="form-msg" role="status">{message}</p>
            <button className="btn primary" type="submit" disabled={busy}>{mode === "signin" ? "Enter platform" : "Create profile"} <span className="arrow">→</span></button>
          </motion.form>
        </AnimatePresence>
        </>}
        </>)}
        <p className="muted" style={{ fontSize: 13, marginTop: 30 }}>Creating an instructor profile needs the access code from the Arabic program, so only teaching staff get instructor tools.</p>
        <Link to="/" className="link">← Back to the learner site</Link>
      </div>
      <div className="teach-art" aria-hidden="true">
        {/* Arabic letters join, so the word is revealed as a whole (right to left), never split into letters. */}
        <motion.span className="ar" initial={{ clipPath: "inset(0 0 0 100%)", y: 20 }} animate={{ clipPath: "inset(0 0 0 0%)", y: 0 }} transition={{ duration: 1.1, ease: [0.7, 0, 0.2, 1], delay: 0.2 }}>معلّم</motion.span>
        <motion.span className="teach-art-sub mono" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>muʿallim · teacher</motion.span>
      </div>
    </div>
  );
}
