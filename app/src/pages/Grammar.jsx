import { useState } from "react";
import { motion } from "framer-motion";
import { PATTERN_PANELS } from "../data/grammar";
import { Ar, RiseText, SpeakButton, spring } from "../components/ui";

const stripTags = html => html.replace(/<[^>]+>/g, "");

export default function Grammar() {
  const [active, setActive] = useState(null);
  return (
    <div className="page grammar">
      <header className="page-hero">
        <p className="mono kicker">Grammar & patterns</p>
        <h1 className="display"><RiseText text="The rules," /> <em><RiseText text="on one page." delay={0.12} /></em></h1>
        <div className="tip sheet">
          <strong>How to read the word lists.</strong> Nouns are written <Ar className="tip-ar">مفرد/جمع</Ar> (singular/plural). Adjectives add <Ar className="tip-ar">ة</Ar> for feminine and <Ar className="tip-ar">ون/ين/ات</Ar> for plurals. Verbs are listed past / present / verbal noun, plus the preposition they take — learn that preposition with the verb.
        </div>
      </header>

      <nav className="grammar-index" aria-label="Topics">
        {PATTERN_PANELS.map((panel, index) => (
          <a key={panel.title} href={`#g-${index}`} onClick={event => { event.preventDefault(); document.getElementById(`g-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); setActive(index); }}>
            <span className="mono">{String(index + 1).padStart(2, "0")}</span>{panel.title}
          </a>
        ))}
      </nav>

      <div className="grammar-grid">
        {PATTERN_PANELS.map((panel, index) => (
          <motion.section
            key={panel.title}
            id={`g-${index}`}
            className={`g-panel sheet${active === index ? " flash" : ""}`}
            initial={{ opacity: 0, y: 40, rotate: index % 2 ? 0.6 : -0.6 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ ...spring, delay: (index % 3) * 0.06 }}
            onAnimationComplete={() => active === index && setActive(null)}
          >
            <div className="g-head">
              <span className="mono g-num">{String(index + 1).padStart(2, "0")}</span>
              <h2 className="h3">{panel.title}</h2>
              <span className="mono muted g-src">{panel.source}</span>
            </div>
            {panel.note && <p className="g-note" dangerouslySetInnerHTML={{ __html: panel.note }} />}
            <table className="g-table">
              <tbody>
                {panel.rows.map(([en, ar], rowIndex) => (
                  <motion.tr key={rowIndex} whileHover={{ x: 4 }} transition={spring}>
                    <td>{en}</td>
                    <td><Ar className="g-ar" dangerouslySetInnerHTML={{ __html: ar }} /></td>
                    <td className="g-say"><SpeakButton text={stripTags(ar)} /></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.section>
        ))}
      </div>
    </div>
  );
}
