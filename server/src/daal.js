// Daal — the AI Arabic tutor. Calls Claude through the official Anthropic SDK and streams replies to the browser.
import Anthropic from "@anthropic-ai/sdk";
import { VOCAB_RAW } from "../../app/src/data/vocab-raw.js";
import { createLimiter } from "./security.js";

export const DAAL_MODES = ["ask", "converse", "check", "quiz", "explain"];
const MAX_TURNS = 30;
const MAX_CHARS = 4000;

const PERSONA = `You are Daal (دال), the Arabic tutor inside the Dartmouth Arabic Language Trainer — a course site for Dartmouth College students in first-year Arabic, which follows the textbooks Alif Baa and Al-Kitaab fi Ta'allum al-'Arabiyya Part 1 (Lessons 1–19). You are a friendly character named after the letter د, and you appear beside every lesson and quiz.

How you teach:
- Your students are beginners. Match their level: the learner context below tells you which unit they are on. When you write Arabic for them to read, prefer words from units they have already reached, add full vowel marks (harakat) on words they may not know, and give a short transliteration or English gloss in parentheses when it helps.
- Teach Modern Standard Arabic (fuṣḥā) by default, as the course does. Al-Kitaab also introduces Egyptian and Levantine colloquial; mention a colloquial form when it is genuinely useful and label it as colloquial.
- Keep replies short — they appear in a chat bubble. A few sentences or a compact list is usually right; go longer only when the student asks for a full explanation.
- Be warm and encouraging, never condescending. Point out what the student got right before correcting.
- Ground grammar explanations in what the course covers (iḍāfa, nisba adjectives, gender and number agreement, the dual, nominal vs. verbal sentences, negation with لا / ما / لم / ليس, roots and patterns, and so on) and give one short example.
- Academic integrity: students may have graded homework from their instructor. If someone asks you to write or complete an assignment for them, coach them through it instead — explain the grammar, give a parallel example with different content, and check their own attempt — rather than producing the answer they would hand in.
- Formatting: plain sentences, short lists with "- ", and **bold** for key terms. No headings, tables, or code blocks.

The course vocabulary, by unit (format: "## key | unit | Arabic title", then "Arabic | English"; nouns are written singular/plural, adjectives masculine/feminine/plural, verbs past/present/verbal noun):

${VOCAB_RAW}`;

const MODE_GUIDES = {
  ask: "Mode: open questions. Answer whatever the student asks about Arabic — meanings, grammar, pronunciation, culture, study tips.",
  converse: "Mode: conversation practice. Hold a short role-play conversation in simple Arabic set in the scenario the student chose (life at Dartmouth). Write each of your turns mostly in Arabic at their level, with a brief English gloss in parentheses for new words. Keep each turn to one or two sentences and end with a question so they can reply. If their reply has a mistake, give the corrected form briefly in one line, then continue the conversation.",
  check: "Mode: writing check. The student will send Arabic they wrote. Reply with: the corrected version (or say it is already correct), then the most important fixes — at most three — each with a one-line reason, then one thing they did well. If what they sent is not Arabic, help them write it in Arabic.",
  quiz: "Mode: quiz. Quiz the student on vocabulary and grammar from units they have reached, one question at a time. Vary the format (meaning of an Arabic word, Arabic for an English word, fill in the blank in a short Arabic sentence about student life, simple grammar choices). After each answer, say whether it is right, give the correct answer with a one-line explanation if needed, keep a running score like (3/4), and ask the next question.",
  explain: "Mode: explain a missed question. The student just answered a practice question wrongly and asked why. Explain in two to four sentences why the correct answer fits and why their choice does not (meaning, grammar, or agreement), with a memory tip if you have a good one. Do not ask a follow-up question."
};

function learnerContext(context = {}, user) {
  const lines = [`Learner: ${user.name}.`];
  if (context.unitTitle) lines.push(`Current unit: ${context.unitTitle} (key "${context.unitKey}"). Units before it in the list above have been studied; later units have not.`);
  if (Array.isArray(context.recentMisses) && context.recentMisses.length) {
    lines.push(`Recently missed in practice: ${context.recentMisses.slice(0, 8).map(item => String(item).slice(0, 80)).join("; ")}.`);
  }
  if (context.scenario) lines.push(`Conversation scenario chosen: ${String(context.scenario).slice(0, 200)}.`);
  return lines.join("\n");
}

function explainPrompt(question = {}) {
  const clip = (value, n = 300) => String(value ?? "").slice(0, n);
  const parts = [
    `Question type: ${{ meaning: "choose the English meaning of an Arabic word", arabic: "choose the Arabic word for an English meaning", grammar: "grammar multiple choice" }[question.kind] || "choose the Arabic word that completes the sentence"}.`,
    `Prompt: ${clip(question.prompt)}`,
    question.translation ? `English translation of the sentence: ${clip(question.translation)}` : "",
    `Options: ${(Array.isArray(question.options) ? question.options : []).map(option => clip(option, 80)).join(" | ")}`,
    `I chose: ${clip(question.chosen, 80)}`,
    `Correct answer: ${clip(question.correct, 80)}`,
    "Why was my answer wrong?"
  ];
  return parts.filter(Boolean).join("\n");
}

/** Validates and normalizes the conversation the browser sends. */
export function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const messages = raw
    .filter(message => (message?.role === "user" || message?.role === "assistant") && typeof message.content === "string" && message.content.trim())
    .map(message => ({ role: message.role, content: message.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return null;
  return messages;
}

/**
 * options: { apiKey, client (injectable for tests), model, effort, perTenMinutes, perDay }
 * Returns null when no API credentials are configured.
 */
export function createDaal({ apiKey, client, model = "claude-opus-5-5", effort = "low", perTenMinutes = 30, perDay = 300 } = {}) {
  if (!client && !apiKey) return null;
  const anthropic = client || new Anthropic({ apiKey });
  const burst = createLimiter({ max: perTenMinutes, windowMs: 10 * 60 * 1000 });
  const daily = createLimiter({ max: perDay, windowMs: 24 * 60 * 60 * 1000 });

  return {
    model,
    allow(userId) {
      if (!burst.hit(`b${userId}`)) return "Daal needs a short break — you’ve sent a lot of messages. Try again in a few minutes.";
      if (!daily.hit(`d${userId}`)) return "You’ve reached today’s limit for Daal. It resets tomorrow.";
      return null;
    },

    /** Streams Daal's reply. onEvent receives { type: "text" | "reset" | "done" | "error", ... }. */
    async reply({ user, mode, messages, context, question, signal, onEvent }) {
      const conversation = mode === "explain" ? [{ role: "user", content: explainPrompt(question) }] : messages;
      const stream = anthropic.beta.messages.stream({
        model,
        max_tokens: 4000, // replies are chat-bubble sized; this caps cost per message
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default", // if a request is declined, Anthropic re-runs it on its recommended fallback model
        output_config: { effort },
        system: [
          { type: "text", text: PERSONA, cache_control: { type: "ephemeral" } }, // stable prefix: cached across all students
          { type: "text", text: `${MODE_GUIDES[mode]}\n\n${learnerContext(context, user)}` }
        ],
        messages: conversation
      }, { signal });

      for await (const event of stream) {
        if (event.type === "content_block_start" && event.content_block.type === "fallback") {
          onEvent({ type: "reset" }); // the first model declined mid-reply; the fallback model starts over
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          onEvent({ type: "text", text: event.delta.text });
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        onEvent({ type: "reset" });
        onEvent({ type: "text", text: "I can’t help with that one — let’s get back to Arabic. Ask me about a word, a grammar point, or try a conversation." });
      } else if (final.stop_reason === "max_tokens") {
        onEvent({ type: "text", text: "…" });
      }
      onEvent({ type: "done", usage: { input: final.usage.input_tokens, cacheRead: final.usage.cache_read_input_tokens ?? 0, output: final.usage.output_tokens } });
    }
  };
}

export function apiErrorMessage(error) {
  if (error instanceof Anthropic.AuthenticationError) return "Daal’s AI key isn’t valid. An administrator needs to update ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.RateLimitError) return "Daal is very busy right now. Try again in a minute.";
  if (error instanceof Anthropic.BadRequestError) return "Daal couldn’t understand that request.";
  if (error instanceof Anthropic.APIConnectionError) return "Daal can’t reach the AI service right now.";
  if (error instanceof Anthropic.APIError) return "Daal hit a problem answering. Please try again.";
  return "Daal hit a problem answering. Please try again.";
}
