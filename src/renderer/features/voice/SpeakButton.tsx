/**
 * =============================================================================
 * SpeakButton — 🔊 read-aloud toggle for any text (chat bubbles, transcript)
 * =============================================================================
 *
 * Exported for OTHER features (the chat agent attaches it to assistant
 * bubbles) WITHOUT ChatTab/VoiceTab importing each other:
 *
 *   import { SpeakButton } from "../voice";
 *   <SpeakButton text={message.text} />
 *
 * It drives `window.barely.voice.speakText()` (preload helper: `voice:speak`
 * status channel + platform speechSynthesis audio) and reflects the shared
 * `stt:status` event so all instances toggle together — the app only has one
 * audio channel anyway.
 *
 * POPUP CONTAINMENT: in-window button only — no native menus/tooltips.
 * =============================================================================
 */

import { useEffect, useState } from "react";

interface SpeakButtonProps {
  /** Text to speak aloud. */
  text: string;
  /** Extra class names (size variants, bubble placement…). */
  className?: string;
  disabled?: boolean;
}

export default function SpeakButton({ text, className, disabled = false }: SpeakButtonProps): JSX.Element {
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = text.trim().length > 0 && !disabled;

  // Shared audio channel: follow the app-wide TTS status.
  useEffect(() => {
    const unsubscribe = window.barely.voice.onSttStatus((event) => {
      if (event.state === "speaking") setSpeaking(true);
      else if (event.state === "idle" || event.state === "error") setSpeaking(false);
    });
    return unsubscribe;
  }, []);

  const handleClick = (): void => {
    if (!canSpeak) return;
    if (speaking) {
      setSpeaking(false);
      void window.barely.voice.speakStop().catch(() => undefined);
      return;
    }
    setSpeaking(true);
    void window.barely.voice.speakText(text).catch((err: unknown) => {
      setSpeaking(false);
      console.error("[barely] speakText failed:", err);
    });
  };

  return (
    <button
      type="button"
      className={`speak-btn${speaking ? " speak-btn--on" : ""}${className ? ` ${className}` : ""}`}
      onClick={handleClick}
      disabled={!canSpeak}
      aria-label={speaking ? "Stop speaking" : "Read aloud"}
      aria-pressed={speaking}
    >
      {speaking ? (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="1.6" fill="currentColor" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M7.6 2.2 4.4 4.9H2.3a.8.8 0 0 0-.8.8v2.6c0 .44.36.8.8.8h2.1l3.2 2.7c.5.42 1.3.07 1.3-.6V2.8c0-.67-.8-1.02-1.3-.6Z"
            fill="currentColor"
          />
          <path
            d="M10 5c.7.6.7 3.4 0 4M11.7 3.4c1.4 1.3 1.4 5.9 0 7.2"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )}
    </button>
  );
}
