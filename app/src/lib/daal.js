// Client side of Daal: streaming replies from the server, learner context, quick reactions, and an open-the-panel bus.
import { ApiError } from "./api";
import { LESSONS } from "../data/vocab";
import { currentUnitIndex, loadProgress, loadReview } from "./curriculum";

/** Streams a reply. Calls onText(delta) as text arrives and onReset() if Daal restarts the answer. */
export async function streamDaal({ mode, messages, question, scenario, signal, onText, onReset }) {
  let response;
  try {
    response = await fetch("/api/daal/chat", {
      method: "POST",
      credentials: "same-origin",
      signal,
      headers: { "content-type": "application/json", "x-requested-with": "dalt" },
      body: JSON.stringify({ mode, messages, question, context: { ...learnerContext(), scenario } })
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(0, "Can’t reach the server. Check your connection and try again.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data.error || "Daal couldn’t answer right now.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, boundary).replace(/^data: /, "");
      buffer = buffer.slice(boundary + 2);
      if (!chunk) continue;
      const event = JSON.parse(chunk);
      if (event.type === "text") onText?.(event.text);
      else if (event.type === "reset") onReset?.();
      else if (event.type === "error") throw new ApiError(500, event.error);
    }
  }
}

/** What Daal knows about where the student is in the course. */
export function learnerContext() {
  const progress = loadProgress();
  const unit = LESSONS[currentUnitIndex(progress)];
  const recentMisses = loadReview().sort((a, b) => (b.lastMissedAt || 0) - (a.lastMissedAt || 0)).slice(0, 8).map(item => item.correctLabel).filter(Boolean);
  return { unitKey: unit?.key, unitTitle: unit?.title, recentMisses };
}

/* ---------- quick reactions (instant, no AI) ---------- */
const pick = list => list[Math.floor(Math.random() * list.length)];
export const REACTIONS = {
  correct: ["أحسنت! Excellent.", "ممتاز! Perfect.", "برافو! You got it.", "صحيح — exactly right.", "رائع! Lovely work.", "تمام! Spot on."],
  streak: ["Three in a row — ما شاء الله!", "You’re on fire. 🔥 Keep going.", "Another one! Your Arabic is growing."],
  wrong: ["Not quite — that’s how we learn.", "قريب! Close. Look at the right one.", "No worries — mistakes stick the word in your memory.", "Almost. Want me to explain?"]
};
export const reaction = (kind, streak = 0) => (kind === "correct" && streak >= 3 ? pick(REACTIONS.streak) : pick(REACTIONS[kind]));

/* ---------- open Daal's chat from anywhere ---------- */
const openListeners = new Set();
export const onOpenDaal = listener => { openListeners.add(listener); return () => openListeners.delete(listener); };
/** openDaal({ mode: "ask" | "converse" | "check" | "quiz", draft?: string, send?: string }) */
export const openDaal = (options = {}) => openListeners.forEach(listener => listener(options));
