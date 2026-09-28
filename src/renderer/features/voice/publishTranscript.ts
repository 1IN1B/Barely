/**
 * =============================================================================
 * publishTranscript — voice → chat hand-off (decoupled integration)
 * =============================================================================
 *
 * The Voice tab must not import from (or edit) the Chat feature, so the
 * transcript is published three ways and the chat side picks whichever it
 * prefers:
 *
 *   1. `barely:voice-transcript` CustomEvent on `window` — push-style
 *      integration (recommended):
 *
 *        window.addEventListener("barely:voice-transcript", (e) => {
 *          const text = (e as CustomEvent<{ text: string }>).detail.text;
 *          setComposerDraft(text);
 *        });
 *
 *   2. `window.barely.voice.getLastTranscript()` — pull-style. contextBridge
 *      values are copied & frozen, so the preload closure is the live slot
 *      (`window.barely.__lastTranscript` is only a best-effort mirror).
 *   3. `window.__lastTranscript` — same value on the plain window object.
 *
 * When the user hits "Use in chat", VoiceTab calls `publishTranscript(text)`.
 * =============================================================================
 */

/** Event name dispatched on `window` when a transcript is handed off. */
export const VOICE_TRANSCRIPT_EVENT = "barely:voice-transcript";

/** `detail` payload of `VOICE_TRANSCRIPT_EVENT`. */
export interface VoiceTranscriptDetail {
  /** The transcript text (already trimmed). */
  text: string;
  /** Where it came from — lets future publishers coexist. */
  source: "voice";
  /** Epoch ms. */
  at: number;
}

declare global {
  interface Window {
    /** Mirror of `window.barely.__lastTranscript` (always writable). */
    __lastTranscript?: string;
  }
}

/** Publish `text` for the chat composer (event + both last-transcript slots). */
export function publishTranscript(text: string): void {
  const trimmed = text.trim();

  // Working slot: preload-backed (contextBridge objects are frozen, so the
  // direct assignment below is best-effort only).
  try {
    window.barely.voice.setLastTranscript(trimmed);
  } catch {
    /* older preload — the event below still carries the text */
  }
  try {
    window.barely.__lastTranscript = trimmed;
  } catch {
    /* frozen bridge — window.__lastTranscript below still works */
  }
  window.__lastTranscript = trimmed;

  const detail: VoiceTranscriptDetail = { text: trimmed, source: "voice", at: Date.now() };
  window.dispatchEvent(new CustomEvent<VoiceTranscriptDetail>(VOICE_TRANSCRIPT_EVENT, { detail }));
}
