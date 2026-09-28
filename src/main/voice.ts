/**
 * =============================================================================
 * voice.ts — speech-to-text transport (main process)
 * =============================================================================
 *
 * Owns the HTTP leg of `voice:transcribe`: posts captured WAV bytes to an
 * OpenAI-compatible `POST {baseUrl}/audio/transcriptions` endpoint as
 * multipart/form-data and returns the transcript text.
 *
 * Design notes:
 *   - Uses the global `fetch` + `FormData`/`Blob` shipped with Electron's
 *     Node runtime — zero new dependencies.
 *   - Auth/API key and model come from the persisted `BarelySettings`
 *     (`apiKey`, `baseUrl`, `sttModel`); the key never leaves main.
 *   - Failures are surfaced as `VoiceError`s with USER-FRIENDLY messages —
 *     the renderer shows them verbatim in the Voice tab.
 *   - Transient network failures are retried exactly once.
 *
 * TTS is renderer-side (`speechSynthesis`) — see src/preload/voice.ts.
 * =============================================================================
 */

import {
  DEFAULT_SETTINGS,
  type TranscribeRequest,
  type TranscribeResult,
} from "../shared/ipc-contract";
import { getSettings } from "./settings";

/** Error with a message safe to show directly in the UI. */
export class VoiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VoiceError";
    this.code = code;
  }
}

/** Hard cap so a stuck request can't wedge the voice pipeline. */
const REQUEST_TIMEOUT_MS = 45_000;
/** Single retry for transient network errors. */
const RETRY_DELAY_MS = 400;
/** WAV header size — anything smaller can't contain audio. */
const MIN_AUDIO_BYTES = 44;

/**
 * Transcribe WAV (or other encoded) audio bytes via the OpenAI-compatible
 * `/audio/transcriptions` endpoint.
 *
 * @throws {VoiceError} with a friendly, user-presentable message.
 */
export async function transcribeAudio(request: TranscribeRequest): Promise<TranscribeResult> {
  const bytes = toBytes(request.audio);
  if (bytes.byteLength < MIN_AUDIO_BYTES) {
    throw new VoiceError("empty-audio", "Nothing to transcribe — the recording was too short.");
  }

  const settings = getSettings();
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    throw new VoiceError(
      "no-api-key",
      "Add your API key in Settings to transcribe speech (key is stored securely on this machine).",
    );
  }

  const model = (settings.sttModel || "").trim() || DEFAULT_SETTINGS.sttModel;
  const baseUrl = (settings.baseUrl || "").trim() || DEFAULT_SETTINGS.baseUrl;
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
  const filename = extensionFor(request.mimeType);

  const startedAt = Date.now();
  const doFetch = (): Promise<Response> =>
    fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: buildFormData(bytes, request.mimeType, filename, model),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    // Transient network/timeout failure — retry once, then give up kindly.
    await delay(RETRY_DELAY_MS);
    try {
      res = await doFetch();
    } catch {
      throw new VoiceError(
        "network",
        "Couldn't reach the speech service — check your connection and API base URL, then try again.",
      );
    }
  }

  if (!res.ok) {
    throw new VoiceError(...mapHttpError(res));
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new VoiceError("bad-response", "The speech service returned an unreadable response.");
  }

  const text = extractText(payload);
  if (!text) {
    throw new VoiceError("empty-transcript", "No speech recognized — try again and speak a little closer to the mic.");
  }

  return { text, durationMs: Date.now() - startedAt };
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

/** Build the multipart body: `file` + `model` (+ optional `response_format`). */
function buildFormData(bytes: Uint8Array, mimeType: string | undefined, filename: string, model: string): FormData {
  const form = new FormData();
  // Copy into a standalone ArrayBuffer-backed view so the Blob is detached
  // from any transferable buffer the renderer handed us.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  form.append("file", new Blob([copy], { type: mimeType ?? "audio/wav" }), filename);
  form.append("model", model);
  return form;
}

/** Map an HTTP error response to [code, friendly message]. */
function mapHttpError(res: Response): [string, string] {
  const where = res.status;
  if (where === 401 || where === 403) {
    return ["invalid-key", "Your API key was rejected — double-check it in Settings."];
  }
  if (where === 404) {
    return [
      "not-found",
      `Speech endpoint not found (${where}) — check the API base URL and STT model in Settings.`,
    ];
  }
  if (where === 429) {
    return ["rate-limited", "Rate limited by the speech service — wait a moment and try again."];
  }
  if (where >= 500) {
    return ["server-error", `The speech service had a problem (${where}) — try again shortly.`];
  }
  return ["http-error", `Transcription failed (${where}) — check your settings and try again.`];
}

/** Pull `text` out of the JSON response without trusting its shape. */
function extractText(payload: unknown): string {
  if (payload && typeof payload === "object" && "text" in payload) {
    const text = (payload as { text: unknown }).text;
    if (typeof text === "string") return text.trim();
  }
  return "";
}

/** Normalize `Uint8Array | ArrayBuffer` to a `Uint8Array`. */
function toBytes(audio: Uint8Array | ArrayBuffer): Uint8Array {
  if (audio instanceof Uint8Array) return audio;
  return new Uint8Array(audio);
}

/** Filename passed to the API — some providers sniff the extension. */
function extensionFor(mimeType: string | undefined): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("webm")) return "audio.webm";
  if (mime.includes("ogg")) return "audio.ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "audio.mp3";
  if (mime.includes("mp4")) return "audio.mp4";
  if (mime.includes("caf")) return "audio.caf";
  return "audio.wav";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
