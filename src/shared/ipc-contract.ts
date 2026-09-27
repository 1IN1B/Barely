/**
 * =============================================================================
 * Barely IPC contract — SINGLE SOURCE OF TRUTH
 * =============================================================================
 *
 * Every IPC channel name and payload type lives in this file. Main-process
 * handlers (`src/main/ipc.ts`), the preload bridge (`src/preload/index.ts`),
 * the renderer API (`window.barely`) and the ambient types
 * (`src/renderer/types/ipc.d.ts`) ALL derive from here.
 *
 * HOW TO ADD A CHANNEL (for follow-on agents):
 *   1. Add the payload type(s) below.
 *   2. Add the channel to `IpcInvokeContract` (request/response via
 *      `ipcRenderer.invoke`) or `IpcEventContract` (main -> renderer push via
 *      `webContents.send`).
 *   3. Add the channel name to `CHANNELS` (guarded by `satisfies` so a typo
 *      or an undeclared channel fails typecheck).
 *   4. Implement the handler in `src/main/ipc.ts`.
 *   5. Expose it on the `window.barely` surface in `src/preload/index.ts`.
 *
 * Naming convention:
 *   - domain:action            -> invoke channel  (renderer asks main)
 *   - domain:event             -> event channel   (main pushes to renderer)
 *   - Reserved domains: overlay, settings, chat, voice, stt, stealth
 * =============================================================================
 */

/* -------------------------------------------------------------------------- */
/* Primitive helpers                                                          */
/* -------------------------------------------------------------------------- */

/** Unsubscribe function returned by every `on*` listener registration. */
export type Unsubscribe = () => void;

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Persisted app settings (stored as JSON at `<userData>/settings.json`).
 *
 * The shape is intentionally open: follow-on agents may add fields — add them
 * to `BarelySettings` + `DEFAULT_SETTINGS` so they stay typed and defaulted.
 */
export interface BarelySettings {
  /** Provider API key (encrypted at rest with `safeStorage` when available). */
  apiKey: string;
  /** OpenAI-compatible API base URL, e.g. `https://api.openai.com/v1`. */
  baseUrl: string;
  /** Model id used for chat, e.g. `gpt-4o-mini`. */
  model: string;
  /** Whether voice input/output features are enabled. */
  voiceEnabled: boolean;
  /** STT model id (voice agent's concern). */
  sttModel: string;
  /** TTS voice id (voice agent's concern). */
  ttsVoice: string;
  /** Global hotkey string, e.g. `CommandOrControl+Shift+Space` (hotkey agent). */
  hotkey: string;
  /** Start the overlay hidden instead of visible. */
  startHidden: boolean;
}

/** Defaults applied for any missing/invalid field on read. */
export const DEFAULT_SETTINGS: Readonly<BarelySettings> = Object.freeze({
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  voiceEnabled: false,
  sttModel: "whisper-1",
  ttsVoice: "alloy",
  hotkey: "CommandOrControl+Shift+Space",
  startHidden: false,
});

/* -------------------------------------------------------------------------- */
/* Overlay                                                                    */
/* -------------------------------------------------------------------------- */

/** Snapshot of the overlay window state returned by overlay commands. */
export interface OverlayWindowState {
  /** Whether the overlay window is currently visible. */
  visible: boolean;
  /** Whether the overlay window currently accepts keyboard focus. */
  focusable: boolean;
  /** Current window bounds in DIPs. */
  bounds: { x: number; y: number; width: number; height: number };
}

/** `barely:overlay-visibility` event payload (main -> renderer). */
export interface OverlayVisibilityEvent {
  visible: boolean;
  /** What triggered the change. */
  reason: "show" | "hide" | "toggle" | "startup";
}

/* -------------------------------------------------------------------------- */
/* Chat (streaming) — reserved now, implemented by the chat agent             */
/* -------------------------------------------------------------------------- */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** `chat:send` invoke payload. */
export interface ChatSendRequest {
  message: string;
  /** Optional conversation/session id echoed back on streamed events. */
  conversationId?: string;
  /** Optional prior turns; the chat agent may ignore and manage its own state. */
  history?: ChatMessage[];
}

/** `chat:send` invoke result — an ack; the actual answer arrives as events. */
export interface ChatSendAck {
  /** Id the stream will use (equals `conversationId` when provided). */
  conversationId: string;
}

/** `chat:chunk` event payload — one streaming delta. */
export interface ChatChunkEvent {
  conversationId: string;
  /** Incremental text delta. */
  delta: string;
  /** Monotonic chunk index starting at 0. */
  index: number;
}

/** `chat:done` event payload — stream finished. */
export interface ChatDoneEvent {
  conversationId: string;
  /** Full assembled assistant message. */
  text: string;
}

/** `chat:error` event payload — stream failed. */
export interface ChatErrorEvent {
  conversationId: string;
  code: string;
  message: string;
}

/* -------------------------------------------------------------------------- */
/* Voice — reserved now, implemented by the voice agent                       */
/* -------------------------------------------------------------------------- */

/** `voice:pushToTalk:start` invoke payload. */
export interface PushToTalkRequest {
  /** Optional id correlating this capture session. */
  sessionId?: string;
}

/** `voice:pushToTalk:*` invoke result. */
export interface PushToTalkAck {
  sessionId: string;
  state: "recording" | "stopped";
}

/** `voice:transcribe` invoke payload — raw mic buffer -> text. */
export interface TranscribeRequest {
  /** PCM/encoded audio bytes captured by the voice agent. */
  audio: Uint8Array | ArrayBuffer;
  /** MIME type hint, e.g. `audio/webm;codecs=opus`. */
  mimeType?: string;
  /** Optional session id from `voice:pushToTalk:start`. */
  sessionId?: string;
}

/** `voice:transcribe` invoke result. */
export interface TranscribeResult {
  text: string;
  durationMs?: number;
}

/** `voice:speak` invoke payload — text -> TTS audio out. */
export interface SpeakRequest {
  text: string;
  /** Overrides `settings.ttsVoice` for this utterance. */
  voice?: string;
  /** Playback speed multiplier. */
  rate?: number;
}

/** `voice:speak` invoke result. */
export interface SpeakAck {
  /** Seconds of audio scheduled/played (approx). */
  durationSec?: number;
}

/** `stt:status` event payload — pushed by main whenever voice state changes. */
export interface SttStatusEvent {
  state: "idle" | "recording" | "transcribing" | "speaking" | "error";
  message?: string;
}

/* -------------------------------------------------------------------------- */
/* Stealth                                                                    */
/* -------------------------------------------------------------------------- */

/** `stealth:panicHide` takes no payload; it hides the overlay immediately. */

/* -------------------------------------------------------------------------- */
/* Channel names                                                              */
/* -------------------------------------------------------------------------- */

/** All invoke (request/response) channels and their args/results. */
export interface IpcInvokeContract {
  "overlay:show": { args: []; result: OverlayWindowState };
  "overlay:hide": { args: []; result: OverlayWindowState };
  "overlay:toggle": { args: []; result: OverlayWindowState };
  "overlay:setFocusable": { args: [focusable: boolean]; result: OverlayWindowState };
  "settings:get": { args: []; result: BarelySettings };
  "settings:set": { args: [patch: Partial<BarelySettings>]; result: BarelySettings };
  "chat:send": { args: [request: ChatSendRequest]; result: ChatSendAck };
  "voice:pushToTalk:start": { args: [request?: PushToTalkRequest]; result: PushToTalkAck };
  "voice:pushToTalk:stop": { args: []; result: PushToTalkAck };
  "voice:transcribe": { args: [request: TranscribeRequest]; result: TranscribeResult };
  "voice:speak": { args: [request: SpeakRequest]; result: SpeakAck };
  "stealth:setDockVisible": { args: [visible: boolean]; result: boolean };
  "stealth:panicHide": { args: []; result: OverlayWindowState };
}

/** All main -> renderer event channels and their payloads. */
export interface IpcEventContract {
  "barely:overlay-visibility": OverlayVisibilityEvent;
  "chat:chunk": ChatChunkEvent;
  "chat:done": ChatDoneEvent;
  "chat:error": ChatErrorEvent;
  "stt:status": SttStatusEvent;
}

/** Union of every channel name known to the contract. */
export type ContractChannel = keyof IpcInvokeContract | keyof IpcEventContract;

/** Union of invoke-only channel names. */
export type InvokeChannel = keyof IpcInvokeContract;

/** Union of event-only channel names. */
export type EventChannel = keyof IpcEventContract;

/**
 * Runtime channel names. The `satisfies` clause is a compile-time guard: any
 * string that is not declared in `IpcInvokeContract` / `IpcEventContract`
 * fails typecheck, so names can never drift between files.
 */
export const CHANNELS = {
  /** Overlay visibility control. */
  OVERLAY_SHOW: "overlay:show",
  OVERLAY_HIDE: "overlay:hide",
  OVERLAY_TOGGLE: "overlay:toggle",
  OVERLAY_SET_FOCUSABLE: "overlay:setFocusable",
  /** Persisted settings. */
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  /** Streaming chat (invoke acks; chunks come back on CHAT_* events). */
  CHAT_SEND: "chat:send",
  CHAT_CHUNK: "chat:chunk",
  CHAT_DONE: "chat:done",
  CHAT_ERROR: "chat:error",
  /** Voice capture / transcription / TTS. */
  VOICE_PTT_START: "voice:pushToTalk:start",
  VOICE_PTT_STOP: "voice:pushToTalk:stop",
  VOICE_TRANSCRIBE: "voice:transcribe",
  VOICE_SPEAK: "voice:speak",
  STT_STATUS: "stt:status",
  /** Stealth controls. */
  STEALTH_SET_DOCK_VISIBLE: "stealth:setDockVisible",
  STEALTH_PANIC_HIDE: "stealth:panicHide",
  /** Main -> renderer events. */
  OVERLAY_VISIBILITY_EVENT: "barely:overlay-visibility",
} as const satisfies Record<string, ContractChannel>;

/** Direction of a channel, derived from the contract maps. */
export type ChannelDirection<C extends ContractChannel> = C extends EventChannel
  ? "event"
  : "invoke";

/* -------------------------------------------------------------------------- */
/* Renderer-facing API surface (`window.barely`)                              */
/* -------------------------------------------------------------------------- */

/**
 * The complete typed API exposed by the preload contextBridge as
 * `window.barely`. Every method corresponds to an invoke channel; every
 * `on*` method subscribes to an event channel and returns an unsubscribe fn.
 *
 * Methods on `chat` / `voice` currently REJECT with a "not implemented" error
 * until the respective agent implements them in `src/main/ipc.ts`.
 */
export interface BarelyApi {
  overlay: {
    show(): Promise<OverlayWindowState>;
    hide(): Promise<OverlayWindowState>;
    toggle(): Promise<OverlayWindowState>;
    /** Focusable=false => click-through-ish overlay; true => accepts typing. */
    setFocusable(focusable: boolean): Promise<OverlayWindowState>;
    onVisibility(listener: (event: OverlayVisibilityEvent) => void): Unsubscribe;
  };
  settings: {
    get(): Promise<BarelySettings>;
    /** Deep-merges `patch` into stored settings and returns the new value. */
    set(patch: Partial<BarelySettings>): Promise<BarelySettings>;
  };
  chat: {
    /** Resolves with an ack; the answer streams in via onChunk/onDone/onError. */
    send(request: ChatSendRequest): Promise<ChatSendAck>;
    onChunk(listener: (event: ChatChunkEvent) => void): Unsubscribe;
    onDone(listener: (event: ChatDoneEvent) => void): Unsubscribe;
    onError(listener: (event: ChatErrorEvent) => void): Unsubscribe;
  };
  voice: {
    startPushToTalk(request?: PushToTalkRequest): Promise<PushToTalkAck>;
    stopPushToTalk(): Promise<PushToTalkAck>;
    transcribe(request: TranscribeRequest): Promise<TranscribeResult>;
    speak(request: SpeakRequest): Promise<SpeakAck>;
    onSttStatus(listener: (event: SttStatusEvent) => void): Unsubscribe;
  };
  stealth: {
    /** macOS only: show/hide the Dock icon (no-op elsewhere). Resolves with
     *  the resulting visibility. */
    setDockVisible(visible: boolean): Promise<boolean>;
    /** Immediately hide the overlay (panic button / screen-share hotkey). */
    panicHide(): Promise<OverlayWindowState>;
  };
}
