import { useState } from "react";
import { motion } from "framer-motion";
import { startSso } from "../lib/auth";
import { spring } from "./ui";

/** "Sign in with Dartmouth" — hands off to Dartmouth's login page (SAML). */
export default function SsoButton({ intent = "student", label = "Dartmouth" }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <motion.button
      type="button"
      className="btn sso-btn"
      onClick={() => { setLeaving(true); startSso(intent); }}
      disabled={leaving}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
    >
      <span className="sso-mark" aria-hidden="true">د</span>
      <span className="sso-text">
        <strong>{leaving ? "Opening Dartmouth login…" : `Sign in with ${label}`}</strong>
        <small>Use your NetID and password</small>
      </span>
      <span className="arrow" aria-hidden="true">→</span>
    </motion.button>
  );
}
