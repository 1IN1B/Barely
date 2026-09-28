/**
 * =============================================================================
 * preload/index.ts — contextBridge: exposes the typed `window.barely` API
 * =============================================================================
 *
 * This directory is the ONLY code that touches `ipcRenderer` (this file plus
 * `voice.ts`, the speech helpers). It whitelists channels from the shared
 * contract (src/shared/ipc-contract.ts) and exposes a nested, fully-typed
 * API to the renderer as `window.barely`.
 *
 * Follow-on agents: after adding a channel to the contract + a handler in
 * src/main/ipc.ts, wire it here (one line per method) and it appears on
 * `window.barely` with types for free.
 * =============================================================================
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  CHANNELS,
  type BarelyApi,
  type EventChannel,
  type IpcEventContract,
  type InvokeChannel,
  type IpcInvokeContract,
  type Unsubscribe,
} from "../shared/ipc-contract";
import { getLastTranscript, listVoices, setLastTranscript, speak, speakText, stopSpeaking } from "./voice";

/** Invoke a contract channel with typed args/result. */
function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: IpcInvokeContract[C]["args"]
): Promise<IpcInvokeContract[C]["result"]> {
  return ipcRenderer.invoke(channel, ...args);
}

/**
 * Subscribe to a contract event channel.
 * Returns an unsubscribe function; listeners are removed on call.
 */
function on<C extends EventChannel>(
  channel: C,
  listener: (payload: IpcEventContract[C]) => void,
): Unsubscribe {
  const wrapped = (_event: IpcRendererEvent, payload: IpcEventContract[C]): void => {
    listener(payload);
  };
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

/* -------------------------------------------------------------------------- */
/* window.barely                                                              */
/* -------------------------------------------------------------------------- */

const barelyApi: BarelyApi = {
  overlay: {
    show: () => invoke(CHANNELS.OVERLAY_SHOW),
    hide: () => invoke(CHANNELS.OVERLAY_HIDE),
    toggle: () => invoke(CHANNELS.OVERLAY_TOGGLE),
    setFocusable: (focusable) => invoke(CHANNELS.OVERLAY_SET_FOCUSABLE, focusable),
    // Activity ping for the optional auto-fade (`settings.autoHideSeconds`).
    userActivity: () => invoke(CHANNELS.OVERLAY_USER_ACTIVITY),
    onVisibility: (listener) => on(CHANNELS.OVERLAY_VISIBILITY_EVENT, listener),
  },
  settings: {
    get: () => invoke(CHANNELS.SETTINGS_GET),
    set: (patch) => invoke(CHANNELS.SETTINGS_SET, patch),
  },
  chat: {
    send: (request) => invoke(CHANNELS.CHAT_SEND, request),
    cancel: () => invoke(CHANNELS.CHAT_CANCEL),
    onChunk: (listener) => on(CHANNELS.CHAT_CHUNK, listener),
    onDone: (listener) => on(CHANNELS.CHAT_DONE, listener),
    onError: (listener) => on(CHANNELS.CHAT_ERROR, listener),
  },
  voice: {
    startPushToTalk: (request) => invoke(CHANNELS.VOICE_PTT_START, request),
    stopPushToTalk: () => invoke(CHANNELS.VOICE_PTT_STOP),
    transcribe: (request) => invoke(CHANNELS.VOICE_TRANSCRIBE, request),
    // speak/speakText/speakStop/listVoices: preload-local helpers (voice.ts)
    // that pair the status channels with platform speechSynthesis audio.
    speak: (request) => speak(request),
    speakText: (text, options) => speakText(text, options),
    speakStop: () => stopSpeaking(),
    listVoices: () => listVoices(),
    setLastTranscript: (text) => setLastTranscript(text),
    getLastTranscript: () => getLastTranscript(),
    onSttStatus: (listener) => on(CHANNELS.STT_STATUS, listener),
  },
  stealth: {
    setDockVisible: (visible) => invoke(CHANNELS.STEALTH_SET_DOCK_VISIBLE, visible),
    panicHide: () => invoke(CHANNELS.STEALTH_PANIC_HIDE),
    // Panic fired from a hotkey/tray/IPC: renderer blurs + clears transient UI.
    onPanic: (listener) => on(CHANNELS.STEALTH_PANIC_EVENT, listener),
  },
};

// `window.barely` — typed in src/renderer/types/ipc.d.ts via BarelyApi.
contextBridge.exposeInMainWorld("barely", barelyApi);
