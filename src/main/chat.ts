/**
 * =============================================================================
 * chat.ts — OpenAI-compatible streaming chat client (main process)
 * =============================================================================
 *
 * Streams `POST {baseUrl}/chat/completions` with `stream: true` over fetch +
 * ReadableStream, parses the SSE feed and forwards every delta to the overlay
 * renderer through the typed event push (wired to `sendToOverlay` in ipc.ts):
 *
 *   chat:send (invoke)  ->  chat:chunk*  ->  chat:done   (success / cancel)
 *                              \-> chat:error            (failure)
 *
 * Design notes (chat agent):
 *   - Renderer-owned conversation state: `chat:send` carries the full prior
 *     `history[]`; main only prepends the Barely system prompt and appends the
 *     new user message. Nothing is persisted server-side between turns.
 *   - Single in-flight stream: a new send supersedes (aborts) the previous one.
 *   - `chat:cancel` aborts via AbortController; a cancelled stream finalizes
 *     with `chat:done` carrying the partial text so the bubble stops cleanly.
 *   - Network failures retry ONCE, but only before any delta was emitted
 *     (never re-run a half-streamed answer).
 *
 * No Electron imports here: events are pushed through an injected callback so
 * this module stays free of circular imports with ipc.ts (and testable).
 * =============================================================================
 */

import { randomUUID } from "node:crypto";
import {
  CHANNELS,
  type ChatCancelAck,
  type ChatMessage,
  type ChatSendAck,
  type ChatSendRequest,
  type EventChannel,
  type IpcEventContract,
} from "../shared/ipc-contract";
import { getSettings } from "./settings";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Typed main -> renderer push (matches `sendToOverlay` in ipc.ts). */
export type ChatEventPush = <C extends EventChannel>(
  channel: C,
  payload: IpcEventContract[C],
) => void;

/** Everything a single stream needs (created per `chat:send`). */
interface StreamContext {
  conversationId: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  controller: AbortController;
  push: ChatEventPush;
  /** Mutable accumulator shared with the SSE reader. */
  acc: { text: string };
}

/** Error carrying a contract `chat:error.code`. */
class ChatRequestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ChatRequestError";
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const FALLBACK_BASE_URL = "https://api.openai.com/v1";
const FALLBACK_MODEL = "gpt-4o-mini";

/** Hard cap on prior turns forwarded per request (keeps payloads bounded). */
const MAX_HISTORY = 40;

/** Total request budget — a hung connection must not spin the UI forever. */
const REQUEST_TIMEOUT_MS = 120_000;

/** Brief Barely persona: the overlay is ~460x420, so answers must be compact. */
const SYSTEM_PROMPT =
  "You are Barely, a tiny always-on-top desktop overlay assistant. " +
  "Answer concisely and directly — the window only shows a few lines at a time. " +
  "Use short paragraphs, tight lists and inline code; skip preamble and pleasantries. " +
  "When asked for code, keep it minimal and correct.";

/** The single in-flight stream (there is only ever one). */
let active: { controller: AbortController } | null = null;

/* -------------------------------------------------------------------------- */
/* Public API (called from ipc.ts handlers)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Kick off a streaming completion. Returns the `chat:send` ack immediately;
 * deltas/errors are pushed asynchronously via `push`.
 *
 * Throws (rejects the invoke) for problems detectable before any network I/O:
 * empty message or a missing API key — the renderer surfaces these inline.
 */
export function startChat(request: ChatSendRequest, push: ChatEventPush): ChatSendAck {
  const text = typeof request.message === "string" ? request.message.trim() : "";
  if (!text) throw new Error("Nothing to send — type a message first.");

  const settings = getSettings();
  const apiKey = settings.apiKey.trim();
  if (!apiKey) throw new Error("Add your API key in Settings");

  const baseUrl = (settings.baseUrl.trim() || FALLBACK_BASE_URL).replace(/\/+$/, "");
  const model = settings.model.trim() || FALLBACK_MODEL;
  const conversationId = request.conversationId?.trim() || randomUUID();

  // Single-flight: supersede anything still streaming.
  if (active) active.controller.abort();
  const controller = new AbortController();
  active = { controller };

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...sanitizeHistory(request.history),
    { role: "user", content: text },
  ];

  const context: StreamContext = {
    conversationId,
    baseUrl,
    model,
    apiKey,
    messages,
    controller,
    push,
    acc: { text: "" },
  };

  void runStream(context);
  return { conversationId };
}

/** Abort the in-flight stream (Stop button). Idle -> `cancelled: false`. */
export function cancelChat(): ChatCancelAck {
  if (!active) return { cancelled: false };
  active.controller.abort();
  return { cancelled: true };
}

/* -------------------------------------------------------------------------- */
/* Orchestration                                                              */
/* -------------------------------------------------------------------------- */

async function runStream(ctx: StreamContext): Promise<void> {
  const started = Date.now();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    ctx.controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const text = await requestWithRetry(ctx);
    ctx.push(CHANNELS.CHAT_DONE, {
      conversationId: ctx.conversationId,
      text,
      ms: Date.now() - started,
    });
  } catch (err) {
    if (ctx.controller.signal.aborted) {
      if (timedOut) {
        ctx.push(CHANNELS.CHAT_ERROR, {
          conversationId: ctx.conversationId,
          code: "timeout",
          message: `The request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. Try again.`,
        });
      } else {
        // User pressed Stop: finalize the partial answer instead of erroring.
        ctx.push(CHANNELS.CHAT_DONE, {
          conversationId: ctx.conversationId,
          text: ctx.acc.text,
          ms: Date.now() - started,
        });
      }
    } else {
      console.error("[barely:chat] stream failed:", err);
      ctx.push(CHANNELS.CHAT_ERROR, {
        conversationId: ctx.conversationId,
        code: err instanceof ChatRequestError ? err.code : "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    clearTimeout(timeout);
    if (active?.controller === ctx.controller) active = null;
  }
}

/** One retry for pure network failures that happened before any output. */
async function requestWithRetry(ctx: StreamContext): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await streamCompletion(ctx);
    } catch (err) {
      if (ctx.controller.signal.aborted) throw err; // cancelled/timed out
      if (attempt >= 1 || !isNetworkError(err) || ctx.acc.text !== "") throw err;
      console.warn("[barely:chat] network error, retrying once:", err);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP + SSE                                                                 */
/* -------------------------------------------------------------------------- */

async function streamCompletion(ctx: StreamContext): Promise<string> {
  const url = `${ctx.baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.apiKey}`,
    },
    body: JSON.stringify({
      model: ctx.model,
      messages: ctx.messages,
      stream: true,
    }),
    signal: ctx.controller.signal,
  });

  if (!response.ok) {
    throw new ChatRequestError("http-error", await httpErrorMessage(response));
  }
  if (!response.body) {
    throw new ChatRequestError("stream-error", "The provider returned an empty body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let index = 0;
  let sawDone = false;

  /** Handle one SSE line; true when the feed announced `[DONE]`. */
  const handleLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false; // comments/keep-alives
    const payload = trimmed.slice(5).trim();
    if (!payload) return false;
    if (payload === "[DONE]") return true;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return false; // tolerate a malformed keep-alive line
    }

    const event = parsed as {
      error?: { message?: string };
      choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }>;
    };
    if (event.error) {
      throw new ChatRequestError(
        "provider-error",
        event.error.message?.trim() || "The provider reported an error.",
      );
    }

    const choice = event.choices?.[0];
    const raw = choice?.delta?.content ?? choice?.message?.content ?? "";
    if (typeof raw === "string" && raw.length > 0) {
      ctx.acc.text += raw;
      ctx.push(CHANNELS.CHAT_CHUNK, {
        conversationId: ctx.conversationId,
        delta: raw,
        index: index++,
      });
    }
    return false;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (handleLine(line)) {
          sawDone = true;
          break;
        }
        newline = buffer.indexOf("\n");
      }
      if (sawDone) break;
    }

    // Providers that close without `[DONE]`: flush any trailing partial line.
    if (!sawDone && buffer.trim()) handleLine(buffer);
  } finally {
    // Release the HTTP body (a no-op once it is fully drained).
    void reader.cancel().catch(() => undefined);
  }

  if (!sawDone && ctx.acc.text === "") {
    // A 200 with no usable content is still an error worth surfacing.
    throw new ChatRequestError(
      "stream-error",
      "The stream ended without any content — the model may be unavailable.",
    );
  }
  return ctx.acc.text;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Human-readable HTTP failure: status + body snippet + a setup hint. */
async function httpErrorMessage(response: Response): Promise<string> {
  let snippet = "";
  try {
    snippet = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 240);
  } catch {
    // body already consumed / unreadable
  }

  const base = `Request failed: HTTP ${response.status}${
    response.statusText ? ` ${response.statusText}` : ""
  }`;
  const detail = snippet ? ` — ${snippet}` : "";

  if (response.status === 401 || response.status === 403) {
    return `${base}${detail}. Check your API key in Settings.`;
  }
  if (response.status === 404) {
    return `${base}${detail}. Check the base URL and model in Settings (base URL should end in /v1).`;
  }
  if (response.status === 429) {
    return `${base}${detail}. Rate limited — wait a moment and retry.`;
  }
  return `${base}${detail}`;
}

/** True for transport-level failures worth retrying once. */
function isNetworkError(err: unknown): boolean {
  if (err instanceof ChatRequestError) return false;
  if (err instanceof TypeError) return true; // undici: "fetch failed" + cause
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause;
  return (
    typeof cause?.code === "string" &&
    ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE"].includes(
      cause.code,
    )
  );
}

/** Keep only well-formed prior turns owned by the renderer. */
function sanitizeHistory(history: ChatMessage[] | undefined): ChatMessage[] {
  if (!Array.isArray(history)) return [];
  const out: ChatMessage[] = [];
  for (const entry of history.slice(-MAX_HISTORY)) {
    if (!entry || typeof entry !== "object") continue;
    const role = entry.role;
    const content = entry.content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content) {
      out.push({ role, content });
    }
  }
  return out;
}
