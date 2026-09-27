/**
 * =============================================================================
 * VoiceTab — PLACEHOLDER owned by the VOICE agent (replace this file).
 * =============================================================================
 *
 * What already works end-to-end:
 *   - `window.barely.voice.startPushToTalk() / stopPushToTalk()` invokes
 *     (currently reject with "[barely:todo]" until src/main/ipc.ts is filled in)
 *   - `window.barely.voice.transcribe({ audio })` buffer -> text invoke
 *   - `window.barely.voice.speak({ text })` TTS invoke
 *   - `window.barely.voice.onSttStatus(...)` main -> renderer status events
 *   - `settings.voiceEnabled` gates the feature (see settings:get/set)
 *
 * The voice agent should implement those handlers in src/main/ipc.ts, push
 * status via `sendToOverlay(CHANNELS.STT_STATUS, ...)` and replace this
 * placeholder with the real push-to-talk button + transcript view.
 *
 * REMEMBER (popup containment rule): no native menus/tooltips — custom
 * in-window components only, or they leak into screen shares.
 * =============================================================================
 */
import { useEffect, useState } from "react";
import type { SttStatusEvent } from "../../../shared/ipc-contract";

export default function VoiceTab(): JSX.Element {
  const [status, setStatus] = useState<SttStatusEvent | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Demonstrate the event subscription; the voice agent will push real events.
  useEffect(() => {
    const unsubscribe = window.barely.voice.onSttStatus(setStatus);
    return unsubscribe;
  }, []);

  const handleMic = async (): Promise<void> => {
    setNote(null);
    try {
      const ack = await window.barely.voice.startPushToTalk();
      setNote(`recording session ${ack.sessionId}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="tab-panel" id="panel-voice" aria-labelledby="tab-voice">
      <div className="coming-soon">
        <div className="coming-soon__icon" aria-hidden="true">
          ◉
        </div>
        <div className="coming-soon__title">Voice is coming soon</div>
        <p className="coming-soon__body">
          Push-to-talk, transcription and TTS will live here. Channels{" "}
          <code>voice:*</code> and the <code>stt:status</code> event are
          reserved in the IPC contract.
        </p>
        {note ? <p className="coming-soon__note">{note}</p> : null}
        {status ? (
          <p className="coming-soon__note">stt: {status.state}</p>
        ) : null}
      </div>

      <div className="voice-dock">
        <button
          type="button"
          className="mic-btn"
          onClick={() => void handleMic()}
          aria-label="Push to talk"
        >
          <span className="mic-btn__ring" aria-hidden="true" />
          <span className="mic-btn__core" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect
                x="5.5"
                y="1.5"
                width="5"
                height="8"
                rx="2.5"
                fill="currentColor"
              />
              <path
                d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </span>
        </button>
        <span className="voice-dock__hint">hold to talk (coming soon)</span>
      </div>
    </section>
  );
}
