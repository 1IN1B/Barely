/**
 * =============================================================================
 * ipc.ts — the IPC handler hub (THE extension point for follow-on agents)
 * =============================================================================
 *
 * All `ipcMain.handle(...)` registrations live here. Implemented today:
 *   - overlay:*   (show / hide / toggle / setFocusable)
 *   - settings:*  (get / set, persisted to <userData>/settings.json)
 *   - stealth:*   (setDockVisible / panicHide)
 *
 * STUBBED (throw `NotImplementedError` until the owning agent implements):
 *   - chat:*      -> chat agent
 *   - voice:*     -> voice agent
 *   - stt:status  -> voice agent (event channel: push with `sendToOverlay`)
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
import { isDockVisible, panicHide, setDockVisible } from "./stealth";

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

  /* ----------------------------- settings -------------------------------- */
  handle(CHANNELS.SETTINGS_GET, () => getSettings());
  handle(CHANNELS.SETTINGS_SET, (patch) => updateSettings(patch));

  /* ------------------------------ chat ----------------------------------- */
  // TODO(chat agent): stream via sendToOverlay(CHANNELS.CHAT_CHUNK, ...),
  // then CHAT_DONE / CHAT_ERROR. Keep the ack shape from the contract.
  handle(CHANNELS.CHAT_SEND, async (): Promise<ChatSendAck> => {
    throw new NotImplementedError(CHANNELS.CHAT_SEND, "chat agent");
  });

  /* ------------------------------ voice ---------------------------------- */
  // TODO(voice agent): record on start, capture on stop, transcribe buffer,
  // stream TTS; push lifecycle updates with sendToOverlay(CHANNELS.STT_STATUS, ...).
  handle(CHANNELS.VOICE_PTT_START, async (): Promise<PushToTalkAck> => {
    throw new NotImplementedError(CHANNELS.VOICE_PTT_START, "voice agent");
  });
  handle(CHANNELS.VOICE_PTT_STOP, async (): Promise<PushToTalkAck> => {
    throw new NotImplementedError(CHANNELS.VOICE_PTT_STOP, "voice agent");
  });
  handle(CHANNELS.VOICE_TRANSCRIBE, async (): Promise<TranscribeResult> => {
    throw new NotImplementedError(CHANNELS.VOICE_TRANSCRIBE, "voice agent");
  });
  handle(CHANNELS.VOICE_SPEAK, async (): Promise<SpeakAck> => {
    throw new NotImplementedError(CHANNELS.VOICE_SPEAK, "voice agent");
  });

  /* ----------------------------- stealth --------------------------------- */
  handle(CHANNELS.STEALTH_SET_DOCK_VISIBLE, (visible: boolean) => {
    setDockVisible(visible);
    return isDockVisible();
  });
  handle(CHANNELS.STEALTH_PANIC_HIDE, () => {
    hideOverlay("hide"); // emits barely:overlay-visibility
    panicHide();
    return getOverlayState();
  });

  // Make sure the overlay exists so window.barely commands have a target
  // even before the first show (also preloads the settings module).
  createOverlayWindow();
}
