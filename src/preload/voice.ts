/**
 * =============================================================================
 * preload/voice.ts — TTS helpers running in the preload (isolated) world
 * =============================================================================
 *
 * Barely's TTS MVP uses the platform `speechSynthesis` engine: zero deps,
 * works offline, and — crucially — produces no separate native window, so it
 * obeys the popup containment rule (unlike Electron `Menu`-style popups).
 *
 * Why preload and not main/renderer?
 *   - main has no speech API; renderer code cannot add methods to the
 *     contextBridge object. Exposing these helpers from preload gives other
 *     features a single call: `window.barely.voice.speakText(text)`.
 *
 * Status bookkeeping: every speak call goes through the `voice:speak`
 * channel first (main emits `stt:status: speaking`) and, when the utterance
 * ends (or is cancelled), through `voice:speak:stop` (main emits `idle`).
 * A generation counter makes rapid re-speak/cancel sequences race-free.
 *
 * NOTE (popup containment): uses only in-page Web Speech APIs — never native
 * menus/tooltips/<select>.
 * =============================================================================
 */

import { ipcRenderer } from "electron";
import {
  CHANNELS,
  type SpeakAck,
  type SpeakRequest,
  type SpeakTextOptions,
  type TtsVoiceInfo,
} from "../shared/ipc-contract";

/* -------------------------------------------------------------------------- */
/* Ambient Web Speech typings                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The preload tsconfig targets Node (`lib: ES2022`, no DOM), so the handful
 * of speech APIs we touch are declared structurally here instead of pulling
 * DOM libs into the main-process project.
 */
interface SynthVoiceLike {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
}

interface SynthUtteranceLike {
  text: string;
  voice: SynthVoiceLike | null;
  rate: number;
  pitch: number;
  volume: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface SpeechSynthesisLike {
  speaking: boolean;
  pending: boolean;
  getVoices(): SynthVoiceLike[];
  speak(utterance: SynthUtteranceLike): void;
  cancel(): void;
}

interface SpeechGlobal {
  speechSynthesis?: SpeechSynthesisLike;
  SpeechSynthesisUtterance?: { new (text: string): SynthUtteranceLike };
}

const speech = globalThis as unknown as SpeechGlobal;
const synth: SpeechSynthesisLike | null = speech.speechSynthesis ?? null;

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

/** Bumped on every speak/cancel so stale onend handlers become no-ops. */
let generation = 0;
/** Safety net if the engine never fires `onend` (silent/broken audio). */
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
/** Last voice list read (voices may populate asynchronously on first use). */
let voicesCache: TtsVoiceInfo[] = [];
/**
 * Shared transcript slot. contextBridge objects are copied & frozen, so the
 * renderer cannot assign `window.barely.__lastTranscript` directly — it calls
 * `setLastTranscript()` (this closure) and reads it back with
 * `getLastTranscript()`. `window.__lastTranscript` mirrors the same value.
 */
let lastTranscript = "";

/* -------------------------------------------------------------------------- */
/* Public API (re-exported through preload/index.ts)                          */
/* -------------------------------------------------------------------------- */

/** Rough spoken duration for `text` at `rate` — used only for UI/safety. */
function estimateSeconds(text: string, rate: number): number {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return Math.max(1, text.length / (14 * safeRate));
}

/**
 * Speak `text` aloud: invokes `voice:speak` (status events + validation),
 * then schedules the platform TTS engine. Resolves once audio is scheduled.
 */
export async function speakText(text: string, options: SpeakTextOptions = {}): Promise<SpeakAck> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) throw new Error("Nothing to speak.");

  const rate = options.rate;
  const request: SpeakRequest = { text: trimmed, voice: options.voice, rate };

  // Cancel any current utterance first so its stale handlers can't emit
  // `idle` while the new one is speaking.
  cancelLocal();

  // Main owns the `stt:status` lifecycle (speaking -> idle).
  const ack = (await ipcRenderer.invoke(CHANNELS.VOICE_SPEAK, request)) as SpeakAck;
  const myGen = generation;

  if (!synth || typeof speech.SpeechSynthesisUtterance !== "function") {
    console.warn("[barely:voice] speechSynthesis unavailable — text not spoken.");
    void emitStopped();
    return ack;
  }
  if (myGen !== generation) return ack; // superseded by a newer speak/cancel

  const utterance = new speech.SpeechSynthesisUtterance(trimmed);
  utterance.rate = clamp(rate ?? 1, 0.1, 10);
  utterance.pitch = clamp(options.pitch ?? 1, 0, 2);
  utterance.volume = 1;

  const preferred = options.voice ?? (await resolveSettingVoice());
  if (preferred) utterance.voice = pickVoice(synth.getVoices(), preferred);

  const finish = (): void => {
    if (myGen !== generation) return; // superseded — a newer call owns status
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    void emitStopped();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  safetyTimer = setTimeout(finish, (estimateSeconds(trimmed, utterance.rate) + 8) * 1000);

  try {
    synth.speak(utterance);
  } catch (err) {
    console.error("[barely:voice] speechSynthesis.speak failed:", err);
    finish();
  }
  return ack;
}

/** Invokes `voice:speak` for status/validation without producing audio. */
export async function speak(request: SpeakRequest): Promise<SpeakAck> {
  return speakText(request.text, { voice: request.voice, rate: request.rate });
}

/** Cancel any current TTS output and emit `stt:status: idle` via main. */
export async function stopSpeaking(): Promise<SpeakAck> {
  cancelLocal();
  return emitStopped();
}

/** Store the shared transcript slot (see `lastTranscript`). */
export function setLastTranscript(text: string): void {
  lastTranscript = text ?? "";
}

/** Read the shared transcript slot. */
export function getLastTranscript(): string {
  return lastTranscript;
}

/**
 * List system voices (`speechSynthesis.getVoices()`), polling briefly on
 * first call — Chromium populates the list asynchronously on some platforms.
 */export async function listVoices(): Promise<TtsVoiceInfo[]> {
  const read = (): TtsVoiceInfo[] =>
    synth
      ? synth.getVoices().map((voice) => ({
          name: voice.name,
          lang: voice.lang,
          isDefault: voice.default,
          isLocal: voice.localService,
        }))
      : [];
  if (!synth) return [];

  const first = read();
  if (first.length > 0) {
    voicesCache = first;
    return first;
  }
  for (let attempt = 0; attempt < 25 && voicesCache.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const voices = read();
    if (voices.length > 0) {
      voicesCache = voices;
      return voices;
    }
  }
  return voicesCache;
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

/** Invalidate pending handlers, kill the safety timer and stop audio. */
function cancelLocal(): void {
  generation += 1;
  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
  try {
    synth?.cancel();
  } catch {
    /* engine may throw while shutting down — safe to ignore */
  }
}

/** Tell main the utterance finished (main emits `stt:status: idle`). */
function emitStopped(): Promise<SpeakAck> {
  return ipcRenderer.invoke(CHANNELS.VOICE_SPEAK_STOP) as Promise<SpeakAck>;
}

/** `settings.ttsVoice` — the persisted preferred voice ("" = system default). */
async function resolveSettingVoice(): Promise<string> {
  try {
    const settings = (await ipcRenderer.invoke(CHANNELS.SETTINGS_GET)) as { ttsVoice?: unknown };
    return typeof settings.ttsVoice === "string" ? settings.ttsVoice.trim() : "";
  } catch {
    return "";
  }
}

/** Best-match voice by exact name, then loose (substring) name match. */
function pickVoice(voices: SynthVoiceLike[], preferred: string): SynthVoiceLike | null {
  const needle = preferred.trim().toLowerCase();
  if (!needle || !voices.length) return null;
  return (
    voices.find((voice) => voice.name.toLowerCase() === needle) ??
    voices.find((voice) => voice.name.toLowerCase().includes(needle)) ??
    voices.find((voice) => needle.includes(voice.name.toLowerCase())) ??
    null
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
