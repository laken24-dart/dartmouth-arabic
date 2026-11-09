import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { logout, useSession } from "../lib/auth";
import { api } from "../lib/api";
import { LESSONS } from "../data/vocab";
import { Counter, RiseText, spring } from "../components/ui";

const SECTIONS = [["classes", "Classes"], ["lesson", "Lesson plans"], ["homework", "Homework"]];

function parseLessonPlan(text) {
  const sections = text.split(/\n\s*\n+/).map(part => part.trim()).filter(Boolean);
  const chunks = sections.length ? sections : text.split(/\n+/).map(part => part.trim()).filter(Boolean);
  return chunks.map((body, index) => {
    const firstLine = body.split("\n")[0].replace(/^#+\s*/, "").replace(/:$/, "").trim();
    const category = /vocab|word/i.test(firstLine) ? "Vocabulary" : /grammar|rule|form/i.test(firstLine) ? "Grammar" : /practice|exercise|activation|sentence/i.test(firstLine) ? "Practice" : `Lesson step ${index + 1}`;
    return { title: firstLine.length < 60 ? firstLine : category, body };
  });
}

async function readText(file, onError) {
  if (!file) return null;
  if (!/\.(txt|md)$/i.test(file.name)) { onError("This prototype reads .txt and .md files only."); return null; }
  return file.text();
}

function ClassPicker({ classes, value, onChange }) {
  return (
    <label className="field"><span>Class</span>
      <select className="select" value={value} onChange={event => onChange(event.target.value)} required>
        <option value="">Select a class…</option>
        {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
  );
}

function UnitDay({ unitKey, setUnitKey, day, setDay }) {
  return (
    <>
      <label className="field"><span>Curriculum unit</span>
        <select className="select" value={unitKey} onChange={event => setUnitKey(event.target.value)}>
          {LESSONS.map((unit, index) => <option key={unit.key} value={unit.key}>{String(index + 1).padStart(2, "0")} · {unit.title}</option>)}
        </select>
      </label>
      <label className="field"><span>Roadmap day</span><input className="input" type="number" min={1} value={day} onChange={event => setDay(Number(event.target.value))} required /></label>
    </>
  );
}

export default function TeacherPlatform() {
  const session = useSession();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [loadError, setLoadError] = useState("");
  const reload = useCallback(() => api("/teacher/classes").then(data => { setClasses(data.classes); setLoadError(""); }).catch(error => setLoadError(error.message)), []);
  useEffect(() => {
    reload();
    // Keep the roster current while the page is open: refresh when the tab regains focus, and every 30s.
    const onFocus = () => { if (document.visibilityState === "visible") reload(); };
    const timer = setInterval(onFocus, 30000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [reload]);
  const [section, setSection] = useState("classes");
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem("dalt-teacher-selected-class") || "");
  const selected = classes.find(item => item.id === selectedId) || classes[0] || null;
  const choose = id => { setSelectedId(id); sessionStorage.setItem("dalt-teacher-selected-class", id); };

  const [classMsg, setClassMsg] = useState("");
  const [lessonMsg, setLessonMsg] = useState("");
  const [homeworkMsg, setHomeworkMsg] = useState("");
  const [steps, setSteps] = useState([]);
  const [source, setSource] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonUnit, setLessonUnit] = useState(LESSONS[0]?.key);
  const [lessonDay, setLessonDay] = useState(1);
  const [hwUnit, setHwUnit] = useState(LESSONS[0]?.key);
  const [hwDay, setHwDay] = useState(2);
  const [hwText, setHwText] = useState("");

  const students = new Set(classes.flatMap(item => (item.students || []).map(student => student.email))).size;
  const lessonCount = classes.reduce((sum, item) => sum + (item.lessons || []).length, 0);
  const homeworkCount = classes.reduce((sum, item) => sum + (item.homework || []).length, 0);

  const createClass = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const { class: made } = await api("/teacher/classes", { method: "POST", body: { name: values.get("name"), course: values.get("course"), description: values.get("description") } });
      await reload();
      choose(made.id);
      setClassMsg(`Class created. Share join code ${made.code} with your learners.`);
      form.reset();
    } catch (error) { setClassMsg(error.message); }
  };

  const deleteClass = async classroom => {
    if (!window.confirm(`Delete ${classroom.name}? Its roster, lesson plans, homework and submissions will be removed.`)) return;
    try { await api(`/teacher/classes/${encodeURIComponent(classroom.id)}`, { method: "DELETE" }); await reload(); }
    catch (error) { setClassMsg(error.message); }
  };

  const removeItem = async (kind, id) => {
    try { await api(`/teacher/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }); await reload(); }
    catch (error) { setClassMsg(error.message); }
  };

  const saveLesson = async event => {
    event.preventDefault();
    const cleanSteps = steps.filter(step => step.title.trim() || step.body.trim());
    if (!selected) { setLessonMsg("Create or select a class first."); return; }
    if (!cleanSteps.length) { setLessonMsg("Convert your text into steps before saving."); return; }
    try {
      await api("/teacher/lessons", { method: "POST", body: { classId: selected.id, unitKey: lessonUnit, dayNumber: lessonDay, title: lessonTitle.trim(), source, steps: cleanSteps } });
      await reload();
      setLessonMsg(`Saved “${lessonTitle.trim()}” for ${selected.name}, Day ${lessonDay}.`);
    } catch (error) { setLessonMsg(error.message); }
  };

  const saveHomework = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (!selected) { setHomeworkMsg("Create or select a class first."); return; }
    const title = String(values.get("title")).trim();
    try {
      await api("/teacher/homework", { method: "POST", body: { classId: selected.id, unitKey: hwUnit, dayNumber: hwDay, title, instructions: hwText.trim(), dueDate: String(values.get("dueDate") || "") } });
      await reload();
      setHomeworkMsg(`Published “${title}” for ${selected.name}, Day ${hwDay}.`);
    } catch (error) { setHomeworkMsg(error.message); }
  };

  const submissions = (selected?.homework || []).filter(item => item.submissions?.length);
  const scheduled = [...(selected?.lessons || []).map(item => ({ ...item, kind: "lessons", label: "Lesson plan" })), ...(selected?.homework || []).map(item => ({ ...item, kind: "homework", label: "Homework" }))]
    .sort((a, b) => a.unitKey.localeCompare(b.unitKey) || a.dayNumber - b.dayNumber);

  return (
    <div className="teach">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/teach" className="wordmark"><span className="seal">د</span><span className="wordmark-text">Dartmouth Arabic<small>Instructor platform</small></span></Link>
          <nav className="nav" aria-label="Instructor sections">
            {SECTIONS.map(([value, label]) => (
              <a key={value} href={`#${value}`} className={section === value ? "active" : ""} onClick={event => { event.preventDefault(); setSection(value); }}>
                {label}{section === value && <motion.span layoutId="teach-ink" className="nav-ink" transition={spring} />}
              </a>
            ))}
          </nav>
          <button type="button" className="account-btn" onClick={async () => { sessionStorage.removeItem("dalt-teacher-selected-class"); await logout(); navigate("/teach/login"); }}>
            <span className="avatar">{(session?.name || "?").slice(0, 1)}</span><span className="name">Sign out</span>
          </button>
        </div>
      </header>

      <div className="page">
        <section className="page-hero">
          <p className="mono kicker">Instructor · {session?.name}</p>
          <h1 className="display"><RiseText text="Your" /> <em><RiseText text="classroom." delay={0.08} /></em></h1>
          <div className="stats-row teach-stats">
            {[[classes.length, "classes"], [students, "learners joined"], [lessonCount, "lesson plans"], [homeworkCount, "homework sets"]].map(([value, label], index) => (
              <motion.div key={label} className="stat" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 + index * 0.06 }}>
                <strong><Counter value={value} /></strong><span>{label}</span>
              </motion.div>
            ))}
          </div>
        </section>

        {loadError && <p className="form-msg">{loadError}</p>}
        <div className="seg teach-tabs" role="tablist">
          {SECTIONS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={section === value} onClick={() => setSection(value)}>
              {section === value && <motion.span layoutId="seg-teach-tab" className="seg-fill" transition={spring} />}<span>{label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {section === "classes" && (
            <motion.div key="classes" className="teach-grid" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div>
                <form className="sheet teach-card" onSubmit={createClass}>
                  <p className="mono kicker">New class</p>
                  <label className="field"><span>Class name</span><input className="input" name="name" required placeholder="ARAB 1 · Fall" /></label>
                  <label className="field"><span>Course</span>
                    <select className="select" name="course"><option>Alif Baa + Al-Kitaab Part 1</option><option>Alif Baa</option><option>Al-Kitaab Part 1</option></select>
                  </label>
                  <label className="field"><span>Description (optional)</span><input className="input" name="description" /></label>
                  <p className="form-msg ok">{classMsg}</p>
                  <button type="submit" className="btn primary">Create class & code</button>
                </form>
                <div className="class-list">
                  {!classes.length && <div className="empty">No classes yet.</div>}
                  {classes.map((item, index) => (
                    <motion.button key={item.id} type="button" className={`class-item${selected?.id === item.id ? " on" : ""}`} onClick={() => choose(item.id)} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
                      <span><strong>{item.name}</strong><small>{(item.students || []).length} learners · {item.course}</small></span>
                      <span className="code mono">{item.code}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
              <div className="sheet teach-card">
                {selected ? (
                  <>
                    <div className="roster-head">
                      <div><p className="mono kicker">Roster & progress</p><h2 className="h2">{selected.name}</h2><p className="muted">{selected.course}{selected.description ? ` · ${selected.description}` : ""}</p></div>
                      <motion.button type="button" className="join-code" title="Copy join code" whileTap={{ scale: 0.92 }} onClick={() => navigator.clipboard?.writeText(selected.code)}>
                        <span className="mono">join code</span><strong>{selected.code}</strong>
                      </motion.button>
                    </div>
                    {(selected.students || []).length ? (
                      <div className="table-wrap">
                        <table className="roster">
                          <thead><tr><th>Learner</th><th>Days</th><th>Units</th><th>Latest</th><th>Unit</th></tr></thead>
                          <tbody>
                            {selected.students.map((student, index) => {
                              const record = student.progress || {};
                              const last = record.latestScore;
                              return (
                                <motion.tr key={student.email} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.04 }}>
                                  <td>{student.name || student.email}</td>
                                  <td><span className="bar-cell"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.min(100, (record.completedDays || 0) * 4)}%` }} />{record.completedDays || 0}</span></td>
                                  <td>{record.passedUnits || 0}</td>
                                  <td>{last ? `${Math.round(last.score)}%` : "—"}</td>
                                  <td>{last?.unitTitle || "—"}</td>
                                </motion.tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : <div className="empty">No learners yet. Share the join code — students enter it on their Path page.</div>}
                    <button type="button" className="link danger-link" onClick={() => deleteClass(selected)}>Delete this class</button>
                    {scheduled.length > 0 && (
                      <div className="subs">
                        <p className="mono kicker" style={{ marginTop: 28 }}>Scheduled for this class</p>
                        {scheduled.map(item => (
                          <div key={item.id} className="scheduled-row">
                            <span className="mono muted">{item.unitKey === "ab" ? "Alif Baa" : `L${item.unitKey}`} · Day {item.dayNumber}</span>
                            <span><strong>{item.title}</strong> <span className="muted">· {item.label}</span></span>
                            <button type="button" className="link" onClick={() => removeItem(item.kind, item.id)}>remove</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {submissions.length > 0 && (
                      <div className="subs">
                        <p className="mono kicker" style={{ marginTop: 28 }}>Homework submissions</p>
                        {submissions.map(hw => (
                          <details key={hw.id} className="sub">
                            <summary><strong>{hw.title}</strong> <span className="mono muted">· {hw.submissions.length} response{hw.submissions.length === 1 ? "" : "s"}</span></summary>
                            {hw.submissions.map(entry => <article key={entry.email}><strong>{entry.name || entry.email}</strong><p dir="auto">{entry.response}</p></article>)}
                          </details>
                        ))}
                      </div>
                    )}
                  </>
                ) : <div className="empty">Create a class to get a join code.</div>}
              </div>
            </motion.div>
          )}

          {section === "lesson" && (
            <motion.form key="lesson" className="sheet teach-card wide" onSubmit={saveLesson} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <p className="mono kicker">Lesson plan → roadmap day</p>
              <p className="muted">Paste or upload a plan. Blank lines split it into steps; edit them, then save. Learners see the plan at the start of that day.</p>
              <div className="form-grid">
                <ClassPicker classes={classes} value={selected?.id || ""} onChange={choose} />
                <UnitDay unitKey={lessonUnit} setUnitKey={setLessonUnit} day={lessonDay} setDay={setLessonDay} />
                <label className="field"><span>Lesson title</span><input className="input" value={lessonTitle} onChange={event => setLessonTitle(event.target.value)} required /></label>
              </div>
              <label className="field"><span>Upload (.txt / .md)</span><input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={async event => { const text = await readText(event.target.files?.[0], setLessonMsg); if (text != null) { setSource(text); if (!lessonTitle) setLessonTitle(event.target.files[0].name.replace(/\.(txt|md)$/i, "")); } }} /></label>
              <label className="field"><span>Lesson plan text</span><textarea className="textarea" rows={8} value={source} onChange={event => setSource(event.target.value)} placeholder={"Vocabulary warm-up\nReview the ten words…\n\nGrammar: iḍāfa\n…"} /></label>
              <button type="button" className="btn" onClick={() => { if (!source.trim()) { setLessonMsg("Add or upload lesson-plan text first."); return; } setSteps(parseLessonPlan(source)); setLessonMsg("Draft steps ready — edit them before saving."); }}>Split into steps</button>
              <div className="steps">
                <AnimatePresence>
                  {steps.map((step, index) => (
                    <motion.article key={index} className="step" layout initial={{ opacity: 0, y: 14, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, x: 40 }} transition={spring}>
                      <span className="mono step-n">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <input className="input" value={step.title} onChange={event => setSteps(list => list.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)))} aria-label={`Step ${index + 1} title`} />
                        <textarea className="textarea" rows={3} value={step.body} onChange={event => setSteps(list => list.map((item, i) => (i === index ? { ...item, body: event.target.value } : item)))} aria-label={`Step ${index + 1} content`} />
                      </div>
                      <button type="button" className="link" onClick={() => setSteps(list => list.filter((_, i) => i !== index))}>remove</button>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </div>
              <p className="form-msg ok">{lessonMsg}</p>
              <button type="submit" className="btn primary">Save to roadmap</button>
            </motion.form>
          )}

          {section === "homework" && (
            <motion.form key="homework" className="sheet teach-card wide" onSubmit={saveHomework} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <p className="mono kicker">Homework → roadmap day</p>
              <p className="muted">Learners must submit a written response before that day’s practice opens.</p>
              <div className="form-grid">
                <ClassPicker classes={classes} value={selected?.id || ""} onChange={choose} />
                <UnitDay unitKey={hwUnit} setUnitKey={setHwUnit} day={hwDay} setDay={setHwDay} />
                <label className="field"><span>Due date (optional)</span><input className="input" type="date" name="dueDate" /></label>
              </div>
              <label className="field"><span>Assignment title</span><input className="input" name="title" required /></label>
              <label className="field"><span>Upload (.txt / .md)</span><input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={async event => { const text = await readText(event.target.files?.[0], setHomeworkMsg); if (text != null) setHwText(text); }} /></label>
              <label className="field"><span>Instructions</span><textarea className="textarea" rows={7} value={hwText} onChange={event => setHwText(event.target.value)} required dir="auto" /></label>
              <p className="form-msg ok">{homeworkMsg}</p>
              <button type="submit" className="btn primary">Publish homework</button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
