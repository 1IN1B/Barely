/**
 * Voice -> chat transcript queue (decoupled hand-off).
 *
 * The Voice tab publishes with `publishTranscript()` (CustomEvent on
 * `window`), but the Chat tab is normally UNMOUNTED while the user is on the
 * Voice tab — so `App.tsx` (always mounted, owns the tabs) catches the event,
 * queues the text here and switches to the Chat tab. `ChatTab` drains the
 * queue on mount (and again on the event, for the already-visible case).
 *
 * Keeping the queue in its own module means neither feature imports the
 * other's components — only this 20-line slot.
 */

/** A transcript waiting to land in the composer. */
interface QueuedTranscript {
  /** Already-trimmed transcript text. */
  text: string;
  /** Epoch ms when it was published (ordering / diagnostics). */
  at: number;
}

let queued: QueuedTranscript | null = null;

/** Queue `text` for the next composer drain (App.tsx, on the voice event). */
export function queueTranscript(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  queued = { text: trimmed, at: Date.now() };
}

/** Read + clear the queue (ChatTab). Returns null when nothing is pending. */
export function takeQueuedTranscript(): QueuedTranscript | null {
  const pending = queued;
  queued = null;
  return pending;
}
