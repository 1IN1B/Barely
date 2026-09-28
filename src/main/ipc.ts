/**
 * =============================================================================
 * ipc.ts — the IPC handler hub (THE extension point for follow-on agents)
 * =============================================================================
 *
 * All `ipcMain.handle(...)` registrations live here. Implemented today:
 *   - overlay:*   (show / hide / toggle / setFocusable / userActivity)
 *   - settings:*  (get / set, persisted to <userData>/settings.json)
 *   - chat:*      (send / cancel — streaming client in chat.ts)
 *   - voice:*     (PTT session + STT transport in voice.ts; TTS status)
 *   - stealth:*   (setDockVisible / panicHide)
 *
 * STUBBED (throw `NotImplementedError` until the owning agent implements):
 *   - (none — chat and voice are implemented; every contract channel has a
 *      real handler)
 *
 * HOW TO ADD A HANDLER:
 *   1. Declare the channel + payload in src/shared/ipc-contract.ts.
 *   2. Add `handle(CHANNELS.YOUR_CHANNEL, (args...) => result)` below — the
 *      `handle` helper types args/result from the contract automatically.
 *   3. Expose it on `window.barely` in src/preload/index.ts.
 *   4. If it is an event channel, push it with `sendToOverlay(CHANNELS.X, payload)`.
 *
 * TO PUSH EVENTS TO THE RENDERER (streaming chunks, status updates, ...):
 *   sendToOverlay(CHAT_CHUNKS, { conversationId, delta, index })
 * =============================================================================
 */

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import {
  CHANNELS,
  type ChatSendAck,
  type EventChannel,
  type IpcEventContract,
  type InvokeChannel,
  type IpcInvokeContract,
  type PushToTalkAck,
  type SpeakAck,
  type TranscribeResult,
} from "../shared/ipc-contract";
import { cancelChat, startChat } from "./chat";
import {
  createOverlayWindow,
  getOverlayState,
  getOverlayWindow,
  hideOverlay,
  setOverlayFocusable,
  showOverlay,
  toggleOverlay,
} from "./overlayWindow";
import { getSettings, updateSettings } from "./settings";
import { applyDockVisible, configureAutoHide, noteUserActivity, panicHide } from "./stealth";
import { transcribeAudio, VoiceError } from "./voice";

/* -------------------------------------------------------------------------- */
/* Typed handler helper                                                       */
/* -------------------------------------------------------------------------- */

type InvokeArgs<C extends InvokeChannel> = IpcInvokeContract[C]["args"];
type InvokeResult<C extends InvokeChannel> = IpcInvokeContract[C]["result"];

/** Register an invoke handler whose args/result are checked against the contract. */
function handle<C extends InvokeChannel>(
  channel: C,
  handler: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>,
): void {
  ipcMain.handle(channel, (_event: IpcMainInvokeEvent, ...args: InvokeArgs<C>) =>
    handler(...args),
  );
}

/** Error thrown by stub handlers; renderer promises reject with this message. */
export class NotImplementedError extends Error {
  readonly code = "not-implemented";
  constructor(channel: string, owner: string) {
    super(
      `[barely:todo] "${channel}" is not implemented yet — owner: ${owner}. ` +
        `See src/main/ipc.ts and src/shared/ipc-contract.ts.`,
    );
    this.name = "NotImplementedError";
  }
}

/* -------------------------------------------------------------------------- */
/* Event push helper (main -> renderer)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Push an event-channel payload to the overlay renderer.
 * No-op when the window has not finished loading (safe during startup).
 */
export function sendToOverlay<C extends EventChannel>(
  channel: C,
  payload: IpcEventContract[C],
): void {
  const win = getOverlayWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

let registered = false;

/** Active push-to-talk session (mic capture happens renderer-side). */
let activePttSession: { sessionId: string; startedAt: number } | null = null;

/** Register every IPC handler. Idempotent — safe to call from app ready. */
export function registerIpcHandlers(): void {
  if (registered) return;
  registered = true;

  /* ----------------------------- overlay --------------------------------- */
  handle(CHANNELS.OVERLAY_SHOW, () => {
    showOverlay();
    return getOverlayState();
  });
  handle(CHANNELS.OVERLAY_HIDE, () => {
    hideOverlay();
    return getOverlayState();
  });
  handle(CHANNELS.OVERLAY_TOGGLE, () => {
    toggleOverlay();
    return getOverlayState();
  });
  handle(CHANNELS.OVERLAY_SET_FOCUSABLE, (focusable: boolean) => {
    setOverlayFocusable(focusable);
    return getOverlayState();
  });
  // Renderer activity ping -> resets the optional auto-fade countdown
  // (`settings.autoHideSeconds`, default 0 = off; see stealth.ts).
  handle(CHANNELS.OVERLAY_USER_ACTIVITY, () => {
    noteUserActivity();
  });

  /* ----------------------------- settings -------------------------------- */
  handle(CHANNELS.SETTINGS_GET, () => getSettings());
  handle(CHANNELS.SETTINGS_SET, (patch) => {
    const next = updateSettings(patch);
    // Auto-fade is a live timer: re-arm it whenever the setting changes.
    if (patch.autoHideSeconds !== undefined) configureAutoHide(next.autoHideSeconds);
    return next;
  });

  /* ------------------------------ chat ----------------------------------- */
  // Streaming client lives in src/main/chat.ts (OpenAI-compatible SSE).
  // Deltas go out as CHAT_CHUNK / CHAT_DONE / CHAT_ERROR via sendToOverlay.
  handle(CHANNELS.CHAT_SEND, (request): ChatSendAck =>
    startChat(request, sendToOverlay),
  );
  handle(CHANNELS.CHAT_CANCEL, () => cancelChat());

  /* ------------------------------ voice ---------------------------------- */
  // Mic capture + WAV encoding run in the renderer (getUserMedia); main only
  // tracks the PTT session, transports STT (src/main/voice.ts) and pushes
  // lifecycle events. TTS audio is produced renderer/preload-side via
  // speechSynthesis — the speak channels below own the status events only.
  handle(CHANNELS.VOICE_PTT_START, (request): PushToTalkAck => {
    const sessionId = request?.sessionId?.trim() || randomUUID();
    activePttSession = { sessionId, startedAt: Date.now() };
    sendToOverlay(CHANNELS.STT_STATUS, { state: "recording" });
    return { sessionId, state: "recording" };
  });
  handle(CHANNELS.VOICE_PTT_STOP, (): PushToTalkAck => {
    const sessionId = activePttSession?.sessionId ?? randomUUID();
    activePttSession = null;
    // No status push here: the renderer immediately follows with
    // `voice:transcribe`, which emits `transcribing` itself.
    return { sessionId, state: "stopped" };
  });
  handle(CHANNELS.VOICE_TRANSCRIBE, async (request): Promise<TranscribeResult> => {
    sendToOverlay(CHANNELS.STT_STATUS, { state: "transcribing" });
    try {
      const result = await transcribeAudio(request);
      sendToOverlay(CHANNELS.STT_STATUS, { state: "idle" });
      return result;
    } catch (err) {
      const message =
        err instanceof VoiceError
          ? err.message
          : "Transcription failed — please try again.";
      console.error("[barely:voice] transcribe failed:", err);
      sendToOverlay(CHANNELS.STT_STATUS, { state: "error", message, error: message });
      throw err instanceof VoiceError ? err : new Error(message);
    }
  });
  handle(CHANNELS.VOICE_SPEAK, (request): SpeakAck => {
    const text = (request?.text ?? "").trim();
    if (!text) throw new Error("Nothing to speak.");
    sendToOverlay(CHANNELS.STT_STATUS, { state: "speaking" });
    // Audio is emitted by the caller's speechSynthesis (preload/voice.ts);
    // duration is a rough text-length estimate for UI progress only.
    return { durationSec: Math.max(1, Math.round(text.length / 14)) };
  });
  handle(CHANNELS.VOICE_SPEAK_STOP, (): SpeakAck => {
    sendToOverlay(CHANNELS.STT_STATUS, { state: "idle" });
    return {};
  });

  /* ----------------------------- stealth --------------------------------- */
  // Persists `settings.dockVisible` and restores the overlay's exact
  // show/hide state afterwards (macOS re-activates the app when the Dock icon
  // reappears — see applyDockVisible in stealth.ts).
  handle(CHANNELS.STEALTH_SET_DOCK_VISIBLE, (visible: boolean) => applyDockVisible(visible));
  handle(CHANNELS.STEALTH_PANIC_HIDE, () => {
    // panicHide() blurs, pushes `barely:stealth-panic` (renderer clears
    // transient UI) and only THEN hides — order matters, see stealth.ts.
    panicHide();
    return getOverlayState();
  });

  // Make sure the overlay exists so window.barely commands have a target
  // even before the first show (also preloads the settings module).
  createOverlayWindow();
}
