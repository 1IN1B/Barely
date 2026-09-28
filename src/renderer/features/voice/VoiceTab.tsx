/**
 * =============================================================================
 * VoiceTab — push-to-talk speech -> text, spoken answers (VOICE agent)
 * =============================================================================
 *
 * Flow: hold mic (or hold Space) -> renderer captures PCM (useRecorder) ->
 * release -> encode 16 kHz mono WAV (wav.ts) -> `voice:transcribe` (main
 * posts to the OpenAI-compatible /audio/transcriptions endpoint) -> transcript
 * lands in the editable box -> "Use in chat" publishes it (CustomEvent +
 * `window.barely.__lastTranscript`, no ChatTab import).
 *
 * TTS: the 🔊 SpeakButton speaks the transcript via
 * `window.barely.voice.speakText()` (preload speechSynthesis).
 *
 * Keyboard: Space is push-to-talk while this tab is focused (typing in the
 * transcript and focused buttons are excluded). The overlay opts into
 * keyboard focus while the Voice tab is mounted.
 *
 * REMEMBER (popup containment rule): no native menus/tooltips/<select> —
 * dropdowns are the custom MiniSelect component.
 * =============================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { BarelySettings, SttStatusEvent, TtsVoiceInfo } from "../../../shared/ipc-contract";
import MiniSelect, { type MiniSelectOption } from "./MiniSelect";
import SpeakButton from "./SpeakButton";
import { publishTranscript } from "./publishTranscript";
import { blobToBytes, encodeWav } from "./wav";
import { friendlyMicError, useRecorder } from "./useRecorder";

/** UI phase of the voice flow. */
type Phase = "idle" | "recording" | "transcribing" | "done";

/** STT models offered in settings (free text falls back to whisper-1). */
const STT_MODEL_OPTIONS: MiniSelectOption[] = [
  { value: "whisper-1", label: "whisper-1" },
  { value: "gpt-4o-mini-transcribe", label: "gpt-4o-mini-transcribe" },
  { value: "gpt-4o-transcribe", label: "gpt-4o-transcribe" },
  // Groq's transcription ids (its /openai/v1/audio/transcriptions rejects the
  // OpenAI ids above) — picked whenever the Groq provider preset is active.
  { value: "whisper-large-v3-turbo", label: "whisper-large-v3-turbo (Groq)" },
  { value: "whisper-large-v3", label: "whisper-large-v3 (Groq)" },
];

export default function VoiceTab(): JSX.Element {
  const recorder = useRecorder();
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [settings, setSettings] = useState<BarelySettings | null>(null);
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([]);
  const [sttStatus, setSttStatus] = useState<SttStatusEvent | null>(null);
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  // Refs mirror async-critical state so hold/release races resolve cleanly.
  const phaseRef = useRef<Phase>("idle");
  const startBusyRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const sessionRef = useRef<string | undefined>(undefined);
  const recordStartRef = useRef<number>(0);

  const setPhase = useCallback((next: Phase): void => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  /* ------------------------------ bootstrap ------------------------------ */

  useEffect(() => {
    let cancelled = false;
    void window.barely.settings
      .get()
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch((err: unknown) => console.error("[barely] settings load failed:", err));
    void window.barely.voice
      .listVoices()
      .then((value) => {
        if (!cancelled) setVoices(value);
      })
      .catch((err: unknown) => console.error("[barely] voice list failed:", err));

    const unsubscribe = window.barely.voice.onSttStatus((event) => {
      setSttStatus(event);
      // Errors from main (invalid key, network…) surface inline.
      if (event.state === "error") setError(event.error ?? event.message ?? "Transcription failed.");
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // This tab wants the keyboard (Space = push-to-talk). Release on unmount so
  // the overlay goes back to click-through-ish behaviour.
  useEffect(() => {
    void window.barely.overlay.setFocusable(true);
    return () => {
      void window.barely.overlay.setFocusable(false);
    };
  }, []);

  // Live recording timer (kept frozen through `transcribing`).
  useEffect(() => {
    if (phase !== "recording") return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - recordStartRef.current);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!handoffNote) return;
    const id = window.setTimeout(() => setHandoffNote(null), 1800);
    return () => window.clearTimeout(id);
  }, [handoffNote]);

  /* --------------------------- push-to-talk flow -------------------------- */

  const finishTalking = useCallback(async (): Promise<void> => {
    const result = await recorder.stop();
    if (!result) {
      // Mic never came up (permission denied, etc.) — stay idle.
      if (phaseRef.current === "recording") setPhase("idle");
      return;
    }

    setPhase("transcribing");
    try {
      await window.barely.voice.stopPushToTalk().catch(() => undefined);
      const bytes = await blobToBytes(encodeWav(result.pcm, result.sampleRate));
      const { text } = await window.barely.voice.transcribe({
        audio: bytes,
        mimeType: "audio/wav",
        sessionId: sessionRef.current,
      });
      const clean = text.trim();
      if (clean) {
        // Push-to-talk appends: hold again to dictate the next sentence.
        setTranscript((previous) => (previous.trim() ? `${previous.trim()} ${clean}` : clean));
      }
      setError(null);
      setPhase("done");
    } catch (err) {
      setError(errorMessage(err));
      setPhase("idle");
    }
  }, [recorder, setPhase]);

  const startTalking = useCallback(async (): Promise<void> => {
    if (startBusyRef.current) return;
    const current = phaseRef.current;
    if (current === "recording" || current === "transcribing") return;

    startBusyRef.current = true;
    stopRequestedRef.current = false;
    setError(null);
    recorder.clearError();
    setHandoffNote(null);
    recordStartRef.current = Date.now();
    setElapsedMs(0);
    setPhase("recording"); // optimistic: the timer runs while macOS grants mic access

    try {
      const ack = await window.barely.voice.startPushToTalk();
      sessionRef.current = ack.sessionId;
      await recorder.start();
      if (stopRequestedRef.current) await finishTalking(); // released during startup
    } catch (err) {
      // friendlyMicError maps TCC/permission names to fix-it text and falls
      // back to the raw message for everything else.
      setError(friendlyMicError(err));
      setPhase("idle");
      await window.barely.voice.stopPushToTalk().catch(() => undefined);
    } finally {
      startBusyRef.current = false;
    }
  }, [finishTalking, recorder, setPhase]);

  const stopTalking = useCallback(async (): Promise<void> => {
    if (startBusyRef.current) {
      // Release happened before the mic was live — finish as soon as it is.
      stopRequestedRef.current = true;
      return;
    }
    if (phaseRef.current !== "recording") return;
    await finishTalking();
  }, [finishTalking]);

  // Global Space = hold-to-talk (skips typing targets and focused buttons).
  useEffect(() => {
    const isTypeTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || target.isContentEditable;
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== "Space" || event.repeat || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypeTarget(event.target)) return;
      event.preventDefault(); // no page scroll while talking
      void startTalking();
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== "Space" || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypeTarget(event.target)) return;
      event.preventDefault();
      void stopTalking();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startTalking, stopTalking]);

  /* -------------------------------- actions ------------------------------- */

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return; // primary button only
    void startTalking();
  };
  const handlePointerUp = (): void => {
    void stopTalking();
  };
  const handlePointerLeave = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.buttons > 0) void stopTalking(); // dragged off while still held
  };
  const handleMicClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (event.detail !== 0) return; // mouse clicks handled by pointer events
    // Keyboard activation (Space/Enter on the focused button) = toggle.
    if (phaseRef.current === "recording") void stopTalking();
    else void startTalking();
  };

  const handleUseInChat = (): void => {
    const text = transcript.trim();
    if (!text) return;
    publishTranscript(text);
    setHandoffNote("Sent to chat ✓");
  };

  const handleSttModelChange = (value: string): void => {
    setSettings((previous) => (previous ? { ...previous, sttModel: value } : previous));
    void window.barely.settings.set({ sttModel: value }).catch((err: unknown) => {
      console.error("[barely] failed to persist sttModel:", err);
    });
  };

  const handleVoiceChange = (value: string): void => {
    setSettings((previous) => (previous ? { ...previous, ttsVoice: value } : previous));
    void window.barely.settings.set({ ttsVoice: value }).catch((err: unknown) => {
      console.error("[barely] failed to persist ttsVoice:", err);
    });
  };

  /* -------------------------------- derived ------------------------------- */

  const sttOptions = useMemo<MiniSelectOption[]>(() => {
    const current = settings?.sttModel.trim() ?? "";
    if (current && !STT_MODEL_OPTIONS.some((option) => option.value === current)) {
      return [{ value: current, label: current }, ...STT_MODEL_OPTIONS];
    }
    return STT_MODEL_OPTIONS;
  }, [settings?.sttModel]);

  const voiceOptions = useMemo<MiniSelectOption[]>(() => {
    const systemDefault: MiniSelectOption = { value: "", label: "System default" };
    return [
      systemDefault,
      ...voices.map((voice) => ({ value: voice.name, label: `${voice.name} · ${voice.lang}` })),
    ];
  }, [voices]);

  const voicePlaceholder = settings?.ttsVoice.trim() || "System default";
  const busy = phase === "transcribing" || recorder.starting;
  const recording = phase === "recording";
  const displayError = error ?? recorder.error;
  const chipState = sttStatus?.state === "speaking" ? "speaking" : phase;

  return (
    <section className="tab-panel voice-tab" id="panel-voice" aria-labelledby="tab-voice">
      {/* ------------------------------ status ----------------------------- */}
      <div className="voice-status" role="status" aria-live="polite">
        <span className={`voice-chip voice-chip--${chipState}`}>
          {chipState === "transcribing" ? (
            <span className="voice-spinner" aria-hidden="true" />
          ) : (
            <span className="voice-chip__dot" aria-hidden="true" />
          )}
          <span className="voice-chip__label">{statusLabel(chipState)}</span>
        </span>
        <span className={`voice-timer${recording || phase === "transcribing" ? "" : " voice-timer--hidden"}`}>
          {formatDuration(recording ? Date.now() - recordStartRef.current : elapsedMs)}
        </span>
      </div>

      {displayError ? (
        <p className="voice-error" role="alert">
          <span className="voice-error__text">{displayError}</span>
          <button
            type="button"
            className="icon-btn voice-error__dismiss"
            aria-label="Dismiss error"
            onClick={() => {
              setError(null);
              recorder.clearError();
            }}
          >
            ✕
          </button>
        </p>
      ) : null}

      {/* ---------------------------- transcript --------------------------- */}
      <textarea
        className="voice-transcript"
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
        placeholder="Your transcript lands here — hold the mic (or Space) to dictate, then edit freely."
        spellCheck={false}
        aria-label="Transcript"
        onFocus={() => void window.barely.overlay.setFocusable(true)}
      />

      <div className="voice-actions">
        <button
          type="button"
          className="voice-btn voice-btn--primary"
          disabled={!transcript.trim() || busy}
          onClick={handleUseInChat}
        >
          Use in chat
        </button>
        <SpeakButton text={transcript} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Clear transcript"
          disabled={!transcript}
          onClick={() => {
            setTranscript("");
            setError(null);
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
            <path
              d="M3.4 3.4l6.2 6.2M9.6 3.4L3.4 9.6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span className="voice-handoff" aria-live="polite">
          {handoffNote ?? ""}
        </span>
      </div>

      {/* ---------------------------- settings ----------------------------- */}
      <div className="voice-settings">
        <MiniSelect
          className="voice-settings__select"
          ariaLabel="STT model"
          value={settings?.sttModel ?? ""}
          options={sttOptions}
          placeholder="stt model"
          disabled={!settings}
          onChange={handleSttModelChange}
        />
        <MiniSelect
          className="voice-settings__select"
          ariaLabel="TTS voice"
          value={settings?.ttsVoice ?? ""}
          options={voiceOptions}
          placeholder={voicePlaceholder}
          disabled={!settings}
          onChange={handleVoiceChange}
        />
      </div>

      {/* ------------------------------ mic dock --------------------------- */}
      <div className="voice-dock">
        <button
          type="button"
          className={`mic-btn${recording ? " mic-btn--recording" : ""}${busy ? " mic-btn--busy" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerUp}
          onClick={handleMicClick}
          disabled={phase === "transcribing"}
          aria-label={recording ? "Release to stop recording" : "Hold to talk"}
          aria-pressed={recording}
        >
          <span className="mic-btn__ring" aria-hidden="true" />
          <span className="mic-btn__core" aria-hidden="true">
            {phase === "transcribing" ? (
              <span className="voice-spinner voice-spinner--lg" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" fill="currentColor" />
                <path
                  d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            )}
          </span>
        </button>
        <span className="voice-dock__hint">{dockHint(phase, recorder.starting)}</span>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function statusLabel(state: SttStatusEvent["state"] | Phase): string {
  switch (state) {
    case "recording":
      return "listening…";
    case "transcribing":
      return "transcribing…";
    case "speaking":
      return "speaking…";
    case "error":
      return "error";
    case "done":
      return "done";
    default:
      return "ready";
  }
}

function dockHint(phase: Phase, starting: boolean): string {
  if (starting) return "waiting for the microphone…";
  switch (phase) {
    case "recording":
      return "release to stop";
    case "transcribing":
      return "transcribing…";
    default:
      return "hold to talk · or hold Space";
  }
}

/** `12345` -> `0:12.3` (tenths keep the tick feeling alive). */
function formatDuration(ms: number): string {
  const clamped = ms < 0 ? 0 : ms;
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

/** User-presentable message for a failed transcription. */
function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  // ipcRenderer.invoke prefixes rejections with "Error invoking remote
  // method '<channel>': [VoiceError: ]" — strip it, keep the human part.
  const cleaned = raw
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^[A-Za-z]*Error:\s*/, "");
  return cleaned.trim() || "Something went wrong — please try again.";
}
