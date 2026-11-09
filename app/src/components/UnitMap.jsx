import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { PASS_PERCENT, dayWords } from "../lib/curriculum";
import { themeFor } from "../lib/themes";
import Daal from "./Daal";
import MapIcon from "./MapIcons";
import { Ar, spring } from "./ui";

/*
 * A unit drawn as a trail map: a winding dotted path that snakes back and forth, one stop per lesson/homework day
 * (marked with a symbol for that day's vocabulary theme), ending at the checkpoint flag.
 * Daal stands on your current stop, walks along the curve when you make progress, and walks to any stop you tap.
 */

const ROW_H = 136;
const TOP = 84;
const POS_KEY = unitKey => `dalt-map-pos-${unitKey}`;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function layout(count, width) {
  const cols = width < 480 ? 3 : width < 720 ? 4 : 5;
  const side = width < 480 ? 46 : 74;
  const gap = (width - side * 2) / (cols - 1);
  const points = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const inRow = i % cols;
    const col = row % 2 === 0 ? inRow : cols - 1 - inRow;
    const wobble = (((i * 37) % 5) - 2) * 6; // deterministic, so the map doesn't jump between renders
    return { x: side + col * gap, y: TOP + row * ROW_H + wobble, row };
  });
  const segments = points.slice(1).map((q, index) => {
    const p = points[index];
    if (p.row === q.row) {
      const mx = (p.x + q.x) / 2;
      return `C ${mx} ${p.y} ${mx} ${q.y} ${q.x} ${q.y}`;
    }
    const dir = p.x > width / 2 ? 1 : -1; // turn around at the edge of the map
    const reach = Math.min(side - 8, ROW_H * 0.55);
    return `C ${p.x + dir * reach} ${p.y} ${q.x + dir * reach} ${q.y} ${q.x} ${q.y}`;
  });
  const rows = Math.ceil(count / cols);
  return { points, segments, cols, rows, height: TOP + (rows - 1) * ROW_H + 96, d: `M ${points[0].x} ${points[0].y} ${segments.join(" ")}` };
}

/* little ink doodles placed between rows so the map feels like a map */
const DOODLES = [
  w => <g key="pines">{[0, 18, 34].map((dx, i) => <path key={i} d={`M${dx} 0 l-9 18 h6 l-7 13 h20 l-7 -13 h6 z`} transform={`translate(${w} 0) scale(${i === 1 ? 1.15 : 0.9})`} />)}</g>,
  w => <g key="river" transform={`translate(${w} 10)`}><path d="M0 0 q14 -8 28 0 t28 0 t28 0 t28 0" /><path d="M10 10 q14 -8 28 0 t28 0 t28 0" /></g>,
  w => <g key="tower" transform={`translate(${w} -14)`}><path d="M10 48 V18 h14 v30 M8 18 h18 l-9 -14 z M14 24 h6 M14 32 h6 M4 48 h26" /><circle cx="17" cy="11" r="1.5" /></g>,
  w => <g key="hills" transform={`translate(${w} 0)`}><path d="M0 34 l22 -30 l14 18 l10 -12 l22 24" /><path d="M18 10 l4 -6 l4 6" /></g>,
  w => <g key="compass" transform={`translate(${w} 0)`}><circle cx="18" cy="18" r="16" /><path d="M18 4 l4 14 l-4 14 l-4 -14 z" /><text x="15" y="-2" fontSize="8" fontFamily="IBM Plex Mono" stroke="none" fill="currentColor">N</text></g>
];

export default function UnitMap({ unit, days, progress, current, passed, ready, onOpenDay, onCheckpoint }) {
  const boxRef = useRef(null);
  const pathRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [lengths, setLengths] = useState(null);
  const [selected, setSelected] = useState(null);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState(1);
  const [arrived, setArrived] = useState(false);
  const daalX = useMotionValue(0);
  const daalY = useMotionValue(0);
  const travelled = useMotionValue(0);
  const daalAt = useRef(null);

  const stops = useMemo(() => {
    const list = days.map(day => {
      const words = dayWords(unit, day);
      const complete = progress.days.includes(day.id);
      return { type: "day", day, words, theme: themeFor(words), complete };
    });
    const firstOpen = list.findIndex(stop => !stop.complete);
    list.forEach((stop, index) => { stop.state = stop.complete ? "done" : current && index === firstOpen ? "active" : "locked"; });
    list.push({ type: "checkpoint", state: passed ? "done" : ready ? "active" : "locked", theme: { id: "flag", label: "Unit checkpoint" } });
    return list;
  }, [days, unit, progress.days, current, passed, ready]);

  // Where Daal belongs: the next thing to do (or the flag once the unit is passed).
  const homeIndex = useMemo(() => {
    if (passed) return stops.length - 1;
    const active = stops.findIndex(stop => stop.state === "active");
    return active >= 0 ? active : -1;
  }, [stops, passed]);
  const doneIndex = useMemo(() => { let last = -1; stops.forEach((stop, index) => { if (stop.state === "done") last = index; }); return last; }, [stops]);

  useLayoutEffect(() => {
    if (!boxRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, []);

  const map = useMemo(() => (width ? layout(stops.length, width) : null), [stops.length, width]);

  // Measure how far along the trail each stop sits, so Daal can walk the real curve.
  useLayoutEffect(() => {
    if (!map || !pathRef.current) return;
    const probe = pathRef.current;
    const original = probe.getAttribute("d");
    const result = map.points.map((point, index) => {
      if (index === 0) return 0;
      probe.setAttribute("d", `M ${map.points[0].x} ${map.points[0].y} ${map.segments.slice(0, index).join(" ")}`);
      return probe.getTotalLength();
    });
    probe.setAttribute("d", original);
    setLengths(result);
  }, [map]);

  const place = useCallback(length => {
    const point = pathRef.current.getPointAtLength(length);
    daalX.set(point.x);
    daalY.set(point.y);
  }, [daalX, daalY]);

  const walkTo = useCallback((index, then) => {
    if (!lengths || daalAt.current == null) { then?.(); return; }
    const from = travelled.get();
    const to = lengths[index];
    if (Math.abs(to - from) < 1) { daalAt.current = index; then?.(); return; }
    setFacing(to >= from ? 1 : -1);
    setWalking(true);
    setArrived(false);
    let lastX = daalX.get();
    animate(travelled, to, {
      duration: reducedMotion() ? 0 : Math.min(2.6, Math.max(0.6, Math.abs(to - from) / 260)),
      ease: [0.45, 0, 0.3, 1],
      onUpdate: value => {
        place(value);
        const x = daalX.get();
        if (Math.abs(x - lastX) > 0.6) setFacing(x > lastX ? 1 : -1);
        lastX = x;
      },
      onComplete: () => {
        daalAt.current = index;
        setWalking(false);
        setArrived(true);
        setTimeout(() => setArrived(false), 900);
        then?.();
      }
    });
  }, [lengths, travelled, place, daalX]);

  // On open: Daal walks from where you last saw it to your current stop (or hops in if nothing changed).
  useEffect(() => {
    if (!lengths || homeIndex < 0) return;
    let saved = -1;
    try { saved = Number(sessionStorage.getItem(POS_KEY(unit.key)) ?? -1); } catch { /* ignore */ }
    const start = saved >= 0 && saved < homeIndex ? saved : Math.max(0, homeIndex - (saved === -1 ? 1 : 0));
    travelled.set(lengths[start]);
    place(lengths[start]);
    daalAt.current = start;
    const timer = setTimeout(() => walkTo(homeIndex), 550);
    try { sessionStorage.setItem(POS_KEY(unit.key), String(homeIndex)); } catch { /* ignore */ }
    return () => clearTimeout(timer);
  }, [lengths, homeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = index => {
    const stop = stops[index];
    setSelected(null);
    if (stop.state === "locked" || homeIndex < 0) { setSelected(index); return; }
    walkTo(index, () => setSelected(index));
  };

  useEffect(() => {
    if (selected == null) return undefined;
    const onKey = event => { if (event.key === "Escape") setSelected(null); };
    const onDown = event => { if (!event.target.closest?.(".map-card, .map-stop")) setSelected(null); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [selected]);

  const total = lengths?.[lengths.length - 1] ?? 0;
  const doneLength = lengths && doneIndex >= 0 ? lengths[Math.min(doneIndex + (homeIndex > doneIndex ? 1 : 0), lengths.length - 1)] : 0;
  const card = selected != null && map ? stops[selected] : null;
  const cardPoint = card ? map.points[selected] : null;
  const lockedReason = card?.state === "locked"
    ? card.type === "checkpoint" ? "Finish every day in this unit to unlock the checkpoint." : current ? `Finish Day ${stops.find(stop => stop.state === "active")?.day?.number ?? ""} first — Daal is waiting there.` : "Pass the previous unit’s checkpoint to unlock this unit."
    : "";

  return (
    <div className={`unit-map${current ? " is-current" : ""}${!current && !passed ? " is-locked" : ""}`} ref={boxRef} style={{ height: map?.height ?? 320 }}>
      {map && (
        <>
          <svg className="map-svg" width={width} height={map.height} aria-hidden="true">
            <g className="map-doodles">
              {Array.from({ length: Math.max(0, map.rows - 1) }, (_, row) => {
                const doodle = DOODLES[(row + unit.key.length) % DOODLES.length];
                const x = row % 2 === 0 ? width * 0.36 : width * 0.52;
                return <g key={row} transform={`translate(0 ${TOP + row * ROW_H + ROW_H / 2 - 16})`}>{doodle(x)}</g>;
              })}
            </g>
            <path d={map.d} className="map-trail" />
            <motion.path d={map.d} className="map-trail-done" initial={{ pathLength: 0 }} animate={{ pathLength: total ? doneLength / total : 0 }} transition={{ duration: 1.2, ease: [0.3, 0, 0.2, 1], delay: 0.2 }} />
            <path ref={pathRef} d={map.d} fill="none" stroke="none" />
          </svg>

          {stops.map((stop, index) => {
            const point = map.points[index];
            const label = stop.type === "checkpoint"
              ? `Unit checkpoint — ${stop.state === "done" ? "passed" : stop.state === "active" ? "ready" : "locked"}`
              : `Day ${stop.day.number}, ${stop.day.title}: ${stop.theme.label} — ${stop.state === "done" ? "done" : stop.state === "active" ? "up next" : "locked"}`;
            return (
              <motion.button
                key={index}
                type="button"
                className={`map-stop ${stop.type === "checkpoint" ? "checkpoint" : stop.day.kind} ${stop.state}${selected === index ? " selected" : ""}`}
                style={{ left: point.x, top: point.y }}
                aria-label={label}
                title={stop.type === "checkpoint" ? "Unit checkpoint" : `Day ${stop.day.number} · ${stop.theme.label}`}
                onClick={() => choose(index)}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...spring, delay: 0.05 + index * 0.025 }}
                whileHover={{ scale: 1.1, rotate: index % 2 ? 4 : -4 }}
                whileTap={{ scale: 0.92 }}
              >
                {stop.state === "active" && <motion.span className="map-pulse" animate={{ scale: [1, 1.7], opacity: [0.5, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
                <span className="map-stop-face"><MapIcon name={stop.type === "checkpoint" ? "flag" : stop.theme.id} size={stop.type === "checkpoint" ? 28 : 24} /></span>
                {stop.type === "day" && <span className="map-stop-num mono">{stop.day.number}</span>}
                {stop.state === "done" && <span className="map-stop-badge"><MapIcon name="check" size={11} strokeWidth={3} /></span>}
                {stop.type === "day" && stop.day.kind === "homework" && stop.state !== "done" && <span className="map-stop-hw"><MapIcon name="pencil" size={10} strokeWidth={2.4} /></span>}
              </motion.button>
            );
          })}

          {homeIndex >= 0 && lengths && (
            <motion.div className={`map-daal${walking ? " walking" : ""}`} style={{ x: daalX, y: daalY }}>
              {/* Daal leans into the direction of travel — never mirrored, since a flipped د is no longer a د */}
              <motion.div className="map-daal-inner" animate={walking ? { y: [0, -9, 0], rotate: facing * 9 } : { y: 0, rotate: 0 }} transition={walking ? { y: { duration: 0.32, repeat: Infinity }, rotate: { duration: 0.2 } } : { duration: 0.25 }}>
                <Daal mood={arrived ? "happy" : walking ? "idle" : "idle"} size={58} track={!walking} />
              </motion.div>
            </motion.div>
          )}

          <AnimatePresence>
            {card && cardPoint && (
              <motion.div
                key={selected}
                className="map-card sheet"
                role="dialog"
                aria-label={card.type === "checkpoint" ? "Unit checkpoint" : `Day ${card.day.number}`}
                style={{ left: Math.min(Math.max(cardPoint.x, 140), width - 140), top: cardPoint.y + 40 }}
                initial={{ opacity: 0, y: -8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={spring}
              >
                <p className="mono map-card-kicker">{card.type === "checkpoint" ? "Checkpoint" : `Day ${card.day.number} · ${card.day.kind === "lesson" ? "Lesson" : "Homework"}`}</p>
                <strong className="map-card-title"><MapIcon name={card.type === "checkpoint" ? "flag" : card.theme.id} size={18} /> {card.theme.label}</strong>
                {card.type === "day" && (
                  <div className="map-card-words">
                    {card.words.slice(0, 4).map(word => <Ar key={word.id} className="map-card-word">{word.ar.split("/")[0]}</Ar>)}
                  </div>
                )}
                {card.type === "checkpoint" && <p className="map-card-note">15 questions · {PASS_PERCENT}% unlocks the next unit.</p>}
                {card.type === "day" && <p className="map-card-note">{card.day.kind === "lesson" ? "Meet these words, then use them in sentences about Dartmouth." : "Bring these words back in new sentences."}</p>}
                {card.state === "locked"
                  ? <p className="map-card-locked"><MapIcon name="lock" size={14} /> {lockedReason}</p>
                  : <button type="button" className={`btn small${card.state === "active" ? " stamp" : ""}`} onClick={() => { setSelected(null); card.type === "checkpoint" ? onCheckpoint(unit) : onOpenDay(unit, card.day); }}>
                      {card.type === "checkpoint" ? (card.state === "done" ? "Retake checkpoint" : "Take the checkpoint") : card.state === "done" ? "Do it again" : card.day.kind === "lesson" ? "Start the lesson" : "Start homework"} <span className="arrow">→</span>
                    </button>}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
