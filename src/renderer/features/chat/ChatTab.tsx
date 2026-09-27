/**
 * =============================================================================
 * ChatTab — PLACEHOLDER owned by the CHAT agent (replace this file).
 * =============================================================================
 *
 * What already works end-to-end:
 *   - `window.barely.chat.send({ message })` invoke (currently rejects with a
 *     "[barely:todo]" NotImplementedError until src/main/ipc.ts is implemented)
 *   - `window.barely.chat.onChunk / onDone / onError` streaming subscriptions
 *   - `overlay.setFocusable(true/false)` — the composer below flips focusable
 *     on focus/blur so typing works while the overlay is otherwise
 *     click-through-ish.
 *
 * The chat agent should implement the main-side streaming handler
 * (`chat:send` in src/main/ipc.ts) and replace this placeholder UI with the
 * real conversation view (messages, streaming bubbles, error states).
 *
 * REMEMBER (popup containment rule): never use native dropdowns/menus —
 * render custom in-window components only.
 * =============================================================================
 */
import { useState, type FormEvent } from "react";

export default function ChatTab(): JSX.Element {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);

  // Typing requires keyboard focus: opt the overlay in, opt out on blur.
  const handleFocus = (): void => {
    void window.barely.overlay.setFocusable(true);
  };
  const handleBlur = (): void => {
    void window.barely.overlay.setFocusable(false);
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setDraft("");
    setNote(null);
    try {
      const ack = await window.barely.chat.send({ message });
      setNote(`queued in ${ack.conversationId} (streaming not implemented yet)`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="tab-panel" id="panel-chat" aria-labelledby="tab-chat">
      <div className="coming-soon">
        <div className="coming-soon__icon" aria-hidden="true">
          ✦
        </div>
        <div className="coming-soon__title">Chat is coming soon</div>
        <p className="coming-soon__body">
          Streaming replies will land here. Channels{" "}
          <code>chat:send → chat:chunk → chat:done</code> are already reserved
          in the IPC contract.
        </p>
        {note ? <p className="coming-soon__note">{note}</p> : null}
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          className="composer__input"
          type="text"
          placeholder="Ask anything…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          aria-label="Message"
        />
        <button
          type="submit"
          className="composer__send"
          aria-label="Send message"
          disabled={draft.trim().length === 0}
        >
          ↑
        </button>
      </form>
    </section>
  );
}
