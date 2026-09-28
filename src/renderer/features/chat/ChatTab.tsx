/**
 * =============================================================================
 * ChatTab — streaming AI chat (BYOK, OpenAI-compatible) — owned by CHAT agent
 * =============================================================================
 *
 * Flow (renderer-owned conversation state):
 *   1. Send pushes the user bubble + an empty assistant placeholder, then
 *      invokes `chat:send({ message, conversationId, history })` — the full
 *      prior turn list travels with every request; main only adds the system
 *      prompt.
 *   2. `chat:chunk` deltas append live into the placeholder (lightweight
 *      markdown: bold / `code` / ``` fences``` / links / bullets).
 *   3. `chat:done` finalizes the bubble (+ duration); `chat:error` swaps the
 *      placeholder for an inline error row. Stop -> `chat.cancel()` -> main
 *      aborts the fetch and finalizes with the partial text.
 *
 * Focus: the overlay is click-through-ish (`focusable: false`) until the
 * composer or a settings field is focused — onFocus flips it on, onBlur off.
 *
 * Voice integrations (both via features/voice's PUBLIC surface):
 *   - transcript hand-off: `barely:voice-transcript` -> App queues it ->
 *      this tab drains the queue into the composer (transcriptQueue.ts).
 *   - `SpeakButton` on every finished assistant bubble (read-aloud TTS).
 *
 * POPUP CONTAINMENT RULE: no native menus, no `title=` tooltips, no
 * `<select>` anywhere in this file — only in-window React + CSS.
 * =============================================================================
 */
import { useEffect, useRef, useState } from "react";
import type {
  ReactNode,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { BarelySettings, ChatMessage } from "../../../shared/ipc-contract";
import ChatSettings from "./ChatSettings";
import { takeQueuedTranscript } from "./transcriptQueue";
import { SpeakButton, VOICE_TRANSCRIPT_EVENT } from "../voice";
/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ChatLine {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  /** Wall-clock duration reported by `chat:done` (assistant lines only). */
  ms?: number;
}

/** ~3 lines: the overlay is 460x420, the composer must stay compact. */
const MAX_INPUT_HEIGHT = 76;

/* -------------------------------------------------------------------------- */
/* Lightweight markdown (bold / inline code / fences / links / bullets)        */
/* -------------------------------------------------------------------------- */

const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  INLINE_PATTERN.lastIndex = 0;
  let cursor = 0;
  let i = 0;
  let match: RegExpExecArray | null = INLINE_PATTERN.exec(text);
  while (match !== null) {
    if (match.index > cursor) out.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      out.push(
        link ? (
          <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>
        ) : (
          <span key={key}>{token}</span>
        ),
      );
    }
    cursor = match.index + token.length;
    match = INLINE_PATTERN.exec(text);
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/** Parse a markdown-ish string into lightweight React blocks. */
function renderMarkdown(text: string, keyBase: string): ReactNode {
  const blocks: ReactNode[] = [];
  let fence: string[] | null = null;
  let key = 0;

  const pushLine = (line: string): void => {
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const blockquote = /^\s*>\s?(.*)$/.exec(line);

    if (heading) {
      blocks.push(
        <p className="md-h" key={key}>
          {renderInline(heading[1], `${keyBase}-h${key++}`)}
        </p>,
      );
    } else if (bullet) {
      blocks.push(
        <p className="md-li" key={key}>
          <span className="md-li__g" aria-hidden="true">
            •
          </span>
          {renderInline(bullet[1], `${keyBase}-b${key++}`)}
        </p>,
      );
    } else if (numbered) {
      blocks.push(
        <p className="md-li" key={key}>
          <span className="md-li__g" aria-hidden="true">
            {numbered[1]}.
          </span>
          {renderInline(numbered[2], `${keyBase}-n${key++}`)}
        </p>,
      );
    } else if (blockquote) {
      blocks.push(
        <p className="md-quote" key={key}>
          {renderInline(blockquote[1], `${keyBase}-q${key++}`)}
        </p>,
      );
    } else if (line.trim()) {
      blocks.push(
        <p key={key}>{renderInline(line, `${keyBase}-p${key++}`)}</p>,
      );
    }
    // Blank lines are visual separators; block margins already provide them.
  };

  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      if (fence) {
        blocks.push(
          <pre className="md-pre" key={key}>
            <code>{fence.join("\n")}</code>
          </pre>,
        );
        fence = null;
        key += 1;
      } else {
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    pushLine(line);
  }

  if (fence) {
    // Unclosed fence (mid-stream or truncated answer) — still render it.
    blocks.push(
      <pre className="md-pre" key={key}>
        <code>{fence.join("\n")}</code>
      </pre>,
    );
  }
  return blocks;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ChatTab(): JSX.Element {
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [settings, setSettings] = useState<BarelySettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  /** Correlates streamed events with the in-flight send (fresh id per send). */
  const conversationRef = useRef<string | null>(null);
  /** True while the composer holds focus (drives the unmount cleanup). */
  const focusRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const hasKey = Boolean(settings?.apiKey);

  /* --------------------------- settings load ---------------------------- */
  useEffect(() => {
    let cancelled = false;
    window.barely.settings
      .get()
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch((err) => console.error("[barely:chat] settings load failed:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  /* --------------------- voice -> chat hand-off -------------------------- */
  // App.tsx queues the transcript published by the Voice tab and flips us
  // into view; drain the queue on mount (usual path — we were unmounted) and
  // on the event itself (covers "already on the Chat tab").
  useEffect(() => {
    const drain = (): void => {
      // Deferred a microtask: App writes the queue from ITS listener for the
      // same event and effect/listener registration order isn't guaranteed to
      // put us second — the microtask runs after every synchronous listener.
      queueMicrotask(() => {
        const queued = takeQueuedTranscript();
        if (!queued) return;
        setDraft((previous) =>
          previous.trim() ? `${previous.trim()} ${queued.text}` : queued.text,
        );
        // Put the caret where the text landed (focus flips focusable on).
        inputRef.current?.focus();
      });
    };

    drain(); // transcript queued while this tab was unmounted
    window.addEventListener(VOICE_TRANSCRIPT_EVENT, drain);
    return () => window.removeEventListener(VOICE_TRANSCRIPT_EVENT, drain);
  }, []);

  /* --------------------------- stream events ---------------------------- */
  useEffect(() => {
    const matches = (conversationId: string): boolean =>
      conversationId === conversationRef.current;

    const offChunk = window.barely.chat.onChunk((event) => {
      if (!matches(event.conversationId)) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (!last || last.role !== "assistant") return prev;
        next[next.length - 1] = { ...last, text: last.text + event.delta };
        return next;
      });
    });

    const offDone = window.barely.chat.onDone((event) => {
      if (!matches(event.conversationId)) return;
      setStreaming(false);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (!last || last.role !== "assistant") return prev;
        const text = event.text || last.text;
        if (!text) next.pop(); // empty answer: no point showing a bubble
        else next[next.length - 1] = { ...last, text, ms: event.ms };
        return next;
      });
    });

    const offError = window.barely.chat.onError((event) => {
      if (!matches(event.conversationId)) return;
      setStreaming(false);
      const errorId = newId("err");
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.text) next.pop();
        return [...next, { id: errorId, role: "error", text: event.message }];
      });
    });

    return () => {
      offChunk();
      offDone();
      offError();
    };
  }, []);

  /* --------------------- focusable lifecycle (chat tab) ------------------ */
  useEffect(() => {
    return () => {
      // Tab unmounted while the composer was focused -> hand focusability back.
      if (focusRef.current) {
        focusRef.current = false;
        void window.barely.overlay.setFocusable(false);
      }
    };
  }, []);

  /* ----------------------------- auto-scroll ---------------------------- */
  // Follow new messages (also clears any transient over-scroll).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Settings mode opens at the top (its head row must be reachable).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = showSettings ? 0 : el.scrollHeight;
  }, [showSettings]);

  /* --------------------------- auto-grow input -------------------------- */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [draft]);

  /* ------------------------------- actions ------------------------------ */
  const handleSend = async (): Promise<void> => {
    const text = draft.trim();
    if (!text || streaming) return;

    const conversationId = newId("chat");
    conversationRef.current = conversationId;

    const history: ChatMessage[] = messages
      .filter(
        (line): line is ChatLine & { role: "user" | "assistant" } =>
          (line.role === "user" || line.role === "assistant") && line.text.trim() !== "",
      )
      .map((line) => ({ role: line.role, content: line.text }));

    const userId = newId("msg");
    const botId = newId("msg");
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text },
      { id: botId, role: "assistant", text: "" },
    ]);
    setDraft("");
    setStreaming(true);

    try {
      await window.barely.chat.send({ message: text, conversationId, history });
    } catch (err) {
      // Pre-flight failure (no API key / empty message): roll back, keep the
      // draft so the user can retry right after fixing settings.
      const reason = err instanceof Error ? err.message : String(err);
      const errorId = newId("err");
      setMessages((prev) => [
        ...prev.filter((line) => line.id !== userId && line.id !== botId),
        { id: errorId, role: "error", text: reason },
      ]);
      setDraft(text);
      setStreaming(false);
    }
  };

  const handleStop = async (): Promise<void> => {
    try {
      const ack = await window.barely.chat.cancel();
      if (!ack.cancelled) setStreaming(false); // nothing was in flight
    } catch {
      setStreaming(false);
    }
  };

  const handleComposerSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void handleSend();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleInputFocus = (): void => {
    focusRef.current = true;
    void window.barely.overlay.setFocusable(true);
  };
  const handleInputBlur = (): void => {
    focusRef.current = false;
    void window.barely.overlay.setFocusable(false);
  };

  /** Keep focus (and therefore focusable=true) while clicking composer buttons. */
  const keepFocus = (event: { preventDefault: () => void }): void => {
    event.preventDefault();
  };

  const handleSettingsSaved = (next: BarelySettings): void => {
    setSettings(next);
  };

  /* -------------------------------- render ------------------------------ */
  const lastAssistantId = [...messages]
    .reverse()
    .find((line) => line.role === "assistant")?.id;

  return (
    <section className="tab-panel" id="panel-chat" aria-labelledby="tab-chat">
      <div className="chat">
        <div className="chat__scroll" ref={scrollRef}>
          {showSettings && settings ? (
            <ChatSettings
              settings={settings}
              onSaved={handleSettingsSaved}
              onClose={() => setShowSettings(false)}
            />
          ) : messages.length === 0 ? (
            <div className="coming-soon">
              <div className="coming-soon__icon" aria-hidden="true">
                ✦
              </div>
              <div className="coming-soon__title">Ask anything…</div>
              {settings && !hasKey ? (
                <>
                  {/* No key yet: swap the welcome copy for the hint + CTA so
                      both fit inside the (short) scroll viewport. */}
                  <p className="coming-soon__note">
                    Chat needs an OpenAI-compatible API key — it stays on this
                    machine.
                  </p>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setShowSettings(true)}
                  >
                    Set API key
                  </button>
                </>
              ) : (
                <p className="coming-soon__body">
                  Short answers stream in right here, above everything else.
                </p>
              )}
            </div>
          ) : (
            messages.map((line) => (
              <article key={line.id} className={`msg msg--${line.role}`}>
                {line.role === "error" ? (
                  <span className="msg__tag">error</span>
                ) : null}
                <div className="msg__body">
                  {line.role === "assistant"
                    ? renderMarkdown(line.text, line.id)
                    : line.text}
                  {streaming && line.id === lastAssistantId ? (
                    <span className="md-cursor" aria-hidden="true" />
                  ) : null}
                </div>
                {line.role === "assistant" && line.text.trim() ? (
                  <div className="msg__meta">
                    {line.ms !== undefined ? (
                      <span>{(line.ms / 1000).toFixed(1)}s</span>
                    ) : null}
                    {/* 🔊 read-aloud — the voice feature's public component
                        (features/voice exports it for exactly this use). */}
                    <SpeakButton
                      text={line.text}
                      className="msg__speak"
                      disabled={streaming && line.id === lastAssistantId}
                    />
                  </div>
                ) : line.ms !== undefined ? (
                  <div className="msg__meta">{(line.ms / 1000).toFixed(1)}s</div>
                ) : null}
              </article>
            ))
          )}
        </div>

        {/* Key reminder for an in-progress conversation (the empty state has
            its own "Set API key" CTA, so the nudge only shows once there are
            messages — otherwise the card's button falls below the fold). */}
        {settings && !hasKey && !showSettings && messages.length > 0 ? (
          <button
            type="button"
            className="chat__nudge"
            onClick={() => setShowSettings(true)}
          >
            Add your API key in Settings →
          </button>
        ) : null}

        {/* Settings mode swaps the composer out so the panel gets the full
            height (460x420 overlay — every pixel counts). */}
        {showSettings ? null : (
        <form className="composer" onSubmit={handleComposerSubmit}>
          <button
            type="button"
            className="composer__tool"
            aria-label={showSettings ? "Close AI settings" : "Open AI settings"}
            onMouseDown={keepFocus}
            onClick={() => setShowSettings((open) => !open)}
          >
            ⚙
          </button>
          <textarea
            ref={inputRef}
            className="composer__input composer__textarea"
            rows={1}
            placeholder="Ask anything…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            aria-label="Message"
            autoComplete="off"
            spellCheck
          />
          {streaming ? (
            <button
              type="button"
              className="composer__send composer__send--stop"
              aria-label="Stop generating"
              onMouseDown={keepFocus}
              onClick={() => void handleStop()}
            >
              ■
            </button>
          ) : (
            <button
              type="submit"
              className="composer__send"
              aria-label="Send message"
              onMouseDown={keepFocus}
              disabled={draft.trim().length === 0}
            >
              ↑
            </button>
          )}
        </form>
        )}
      </div>
    </section>
  );
}
