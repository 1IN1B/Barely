# Barely

**An invisible, always-on-top AI overlay assistant** — a compact translucent
panel that floats over your other apps with AI chat, voice I/O, and
screen-share invisibility. Fully local: no backend server.

> **Status:** foundation scaffold (v0.1). This repo contains the Electron
> shell, the invisibility core, and the IPC contract. Chat and voice are
> reserved stubs for follow-on agents — see [Roadmap](#roadmap--who-owns-what).

---

## Quick start

```bash
npm install        # installs deps + Electron binary
npm run dev        # dev: HMR renderer + electron
npm run typecheck  # tsc over main/preload/shared + renderer (zero errors expected)
npm run build      # production build -> out/
npm start          # preview the production build (electron-vite preview)
```

| Script         | What it does                                            |
| -------------- | ------------------------------------------------------- |
| `npm run dev`  | electron-vite dev server + Electron with HMR            |
| `npm run build`| Builds `out/main`, `out/preload`, `out/renderer`        |
| `npm start`    | Runs the built output (`electron-vite preview`)         |
| `npm run typecheck` | `tsc --noEmit` on both TS projects (node + web)    |

Debug aids: `BARELY_DEVTOOLS=1 npm start` opens DevTools;
`npx electron . --remote-debugging-port=9222` exposes CDP.

---

## Architecture

```
barely/
├─ package.json, electron.vite.config.ts, tsconfig*.json, .gitignore
├─ src/
│  ├─ main/                       # Electron main process (TypeScript)
│  │  ├─ index.ts                 # entry: single-instance lock, lifecycle, menu=null
│  │  ├─ overlayWindow.ts         # creates/manages the invisible overlay window  ← invisibility core
│  │  ├─ ipc.ts                   # ipcMain handler hub — THE extension point
│  │  ├─ stealth.ts               # content-protection, dock toggle, panicHide
│  │  └─ settings.ts              # JSON settings store (+ safeStorage encryption)
│  ├─ preload/
│  │  └─ index.ts                 # contextBridge → exposes typed `window.barely`
│  ├─ renderer/                   # React 18 + TS overlay UI (Vite root)
│  │  ├─ index.html               # entry html (CSP meta)
│  │  ├─ src/main.tsx             # React bootstrap
│  │  ├─ src/App.tsx              # shell: header / tabs / content / statusbar
│  │  ├─ styles.css               # dark translucent compact styling
│  │  ├─ components/              # OverlayHeader, OverlayTabs, OverlayStatusbar
│  │  ├─ features/chat/           # ← CHAT agent owns ChatTab.tsx
│  │  ├─ features/voice/          # ← VOICE agent owns VoiceTab.tsx
│  │  └─ types/ipc.d.ts           # `window.barely` ambient typing
│  └─ shared/
│     └─ ipc-contract.ts          # ★ SINGLE SOURCE OF TRUTH (channels + types)
└─ README.md
```

**Process flow:** renderer UI ⇄ (`contextBridge` `window.barely`) ⇄ preload
whitelist ⇄ `ipcMain` handlers (`src/main/ipc.ts`) ⇄ overlay/settings/stealth
modules. Main pushes events back with `sendToOverlay(channel, payload)`.

TypeScript projects: `tsconfig.node.json` (main/preload/shared/config) and
`tsconfig.web.json` (renderer), referenced from `tsconfig.json`.

---

## ★ The IPC contract (`src/shared/ipc-contract.ts`)

**Single source of truth.** Channel names, payload types, and the
`window.barely` surface all derive from this file. The `CHANNELS` object is
`as const satisfies Record<string, ContractChannel>` — a channel string that
wasn't declared in the contract **fails typecheck**.

### Invoke channels (renderer → main, `barely.<domain>.<method>()`)

| Channel                     | Args → Result | Status |
| --------------------------- | ------------- | ------ |
| `overlay:show`              | `() → OverlayWindowState` | ✅ implemented |
| `overlay:hide`              | `() → OverlayWindowState` | ✅ implemented |
| `overlay:toggle`            | `() → OverlayWindowState` | ✅ implemented |
| `overlay:setFocusable`      | `(boolean) → OverlayWindowState` | ✅ implemented |
| `settings:get`              | `() → BarelySettings` | ✅ implemented |
| `settings:set`              | `(Partial<BarelySettings>) → BarelySettings` | ✅ implemented |
| `chat:send`                 | `(ChatSendRequest) → ChatSendAck` | 🚧 stub (throws) |
| `voice:pushToTalk:start`    | `(PushToTalkRequest?) → PushToTalkAck` | 🚧 stub (throws) |
| `voice:pushToTalk:stop`     | `() → PushToTalkAck` | 🚧 stub (throws) |
| `voice:transcribe`          | `(TranscribeRequest) → TranscribeResult` | 🚧 stub (throws) |
| `voice:speak`               | `(SpeakRequest) → SpeakAck` | 🚧 stub (throws) |
| `stealth:setDockVisible`    | `(boolean) → boolean` | ✅ implemented |
| `stealth:panicHide`         | `() → OverlayWindowState` | ✅ implemented |

🚧 stubs reject with a
`[barely:todo] "<channel>" is not implemented yet — owner: <agent>` error.
Electron logs `Error occurred in handler for 'chat:send'...` to the terminal
when a stub is invoked — **that is expected**, not a crash.

### Event channels (main → renderer, `barely.<domain>.on<Name>(fn) → unsubscribe`)

| Channel                     | Payload | Producer |
| --------------------------- | ------- | -------- |
| `barely:overlay-visibility` | `{ visible, reason: 'show'\|'hide'\|'toggle'\|'startup' }` | `overlayWindow.ts` |
| `chat:chunk`                | `{ conversationId, delta, index }` | chat agent |
| `chat:done`                 | `{ conversationId, text }` | chat agent |
| `chat:error`                | `{ conversationId, code, message }` | chat agent |
| `stt:status`                | `{ state, message? }` | voice agent |

### Renderer API shape

```ts
window.barely.overlay.show() / .hide() / .toggle() / .setFocusable(bool)
window.barely.overlay.onVisibility(cb)              // → unsubscribe
window.barely.settings.get() / .set(patch)
window.barely.chat.send(req)                        // streams via events
window.barely.chat.onChunk(cb) / .onDone(cb) / .onError(cb)
window.barely.voice.startPushToTalk() / .stopPushToTalk()
window.barely.voice.transcribe({ audio }) / .speak({ text })
window.barely.voice.onSttStatus(cb)
window.barely.stealth.setDockVisible(bool) / .panicHide()
```

### How to add an IPC channel (4 steps)

1. **Contract** — add payload type(s) + entry to `IpcInvokeContract` (or
   `IpcEventContract`) + name to `CHANNELS` in `src/shared/ipc-contract.ts`.
2. **Handler** — in `src/main/ipc.ts`:
   `handle(CHANNELS.YOUR_CHANNEL, (args…) => result)` — args/result are typed
   from the contract automatically. To push an event: use the exported
   `sendToOverlay(CHANNELS.YOUR_EVENT, payload)`.
3. **Preload** — expose it on `window.barely` in `src/preload/index.ts`
   (`invoke(…)` / `on(…)`).
4. **UI** — consume it; the ambient type in `src/renderer/types/ipc.d.ts`
   picks up `BarelyApi` automatically.

---

## The invisibility core (`src/main/overlayWindow.ts`)

What makes Barely invisible in screen shares (implementations are final —
read the file header before touching):

1. **`contentProtection(true)`** — macOS `NSWindowSharingNone` / Windows
   `WDA_EXCLUDEFROMCAPTURE`. **Re-asserted** (idempotently) after window
   construction, on `ready-to-show`, and after **every `show()`**, because
   AppKit can silently reset it. Helper: `reassertContentProtection()` in
   `stealth.ts`.
2. **Window chrome** — `transparent, frame: false, 460×420, resizable: false,
   show: false, skipTaskbar: true, acceptFirstMouse: true`,
   `setAlwaysOnTop(true, 'screen-saver')`, macOS
   `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.
3. **`focusable: false` by default** (click-through-ish overlay). When the
   user opens chat input the renderer calls
   `barely.overlay.setFocusable(true)` (→ `setFocusable(true)` + `focus()`);
   the Chat composer already flips this on focus/blur.
4. **No native menus, ever** — `Menu.setApplicationMenu(null)` at startup;
   `context-menu` event is `preventDefault`ed on the overlay webContents;
   `win.setMenu()` must never be called.

### ⚠️ POPUP CONTAINMENT RULE (learned from Pluely v1.1.0) — READ THIS

**Content protection covers ONLY the overlay window itself.** Native OS
popups — context menus, tooltips (`title=` attributes!), `<select>` dropdowns,
spellcheck menus, autocomplete lists — are **separate native windows** and
**WILL LEAK into screen captures** even while the overlay is hidden.

Therefore, inside the overlay UI:

- ❌ Never use `title=` attributes → native tooltips leak. Use `aria-label`
  and custom in-window UI.
- ❌ Never use `<select>`, native context menus, Electron `Menu`, or
  `setApplicationMenu` other than `null`.
- ✅ Build menus/dropdowns/tooltips as plain in-window React components
  (divs + CSS). The renderer already CSS-only.

### Stealth helpers (`src/main/stealth.ts`)

```ts
reassertContentProtection(win)   // idempotent core call
setDockVisible(visible)          // macOS app.dock hide/show (stealth:setDockVisible)
isDockVisible()
panicHide()                      // hides every registered protected window
registerProtectedWindow(win)     // future windows (tray popups…) join panicHide
```

Overlay primitives (for tray/hotkey agents):
`createOverlayWindow()`, `showOverlay(reason?)`, `hideOverlay(reason?)`,
`toggleOverlay()`, `setOverlayFocusable(bool)`, `getOverlayWindow()`,
`getOverlayState()`, `isOverlayVisible()` — all in `overlayWindow.ts`.

**Not implemented here (other agents):** tray icon, global hotkeys, chat
streaming, STT/TTS.

---

## Settings storage (`src/main/settings.ts`)

- **Location:** `app.getPath('userData')/settings.json`
  (macOS: `~/Library/Application Support/Barely/settings.json`).
- **Shape:** `BarelySettings` from the contract — `{ apiKey, baseUrl, model,
  voiceEnabled, sttModel, ttsVoice, hotkey, startHidden }` (+ room to grow;
  add fields to `BarelySettings` **and** `DEFAULT_SETTINGS`).
- **Writes:** atomic (`.tmp` + rename), cached in memory, merged with
  defaults on read. Corrupt files fall back to defaults instead of crashing.
- **API key security (MVP):** encrypted at rest with Electron `safeStorage`
  (Keychain/DPAPI/libsecret) when `safeStorage.isEncryptionAvailable()`,
  stored base64 in `apiKeyEnc`; **graceful plaintext fallback** in `apiKey`
  when it isn't (documented limitation — acceptable for MVP, tighten later).
  Decrypt failures surface as an empty key, never a crash.

---

## Invisibility caveats (known limits)

- **Captures of the overlay itself:** `contentProtection` excludes the window
  from *screen shares / screenshots / recordings*. Verifying the UI visually
  therefore requires `webContents.capturePage()` from main (CDP
  `Page.captureScreenshot` of that target also works), not a screen grab.
- **Popups leak** — see [POPUP CONTAINMENT RULE](#-popup-containment-rule-learned-from-pluely-v110--read-this).
- **Audio:** microphone/system audio of *other* apps is untouched; voice
  capture (agent's job) will need mic permissions (`NSMicrophoneUsageDescription`
  will be required when packaging — not needed for `npm run dev` prompts).

---

## Roadmap / who owns what

| Area | Owner | Touch points |
| ---- | ----- | ------------ |
| Scaffold + invisibility + IPC contract | ✅ done | `overlayWindow.ts`, `ipc.ts`, `stealth.ts`, `ipc-contract.ts` |
| Chat (streaming UI + main handler) | chat agent | `src/main/ipc.ts` (`chat:*`), `src/renderer/features/chat/` |
| Voice (PTT, STT, TTS) | voice agent | `src/main/ipc.ts` (`voice:*`, `stt:status`), `src/renderer/features/voice/` |
| Tray + global hotkeys | hotkey agent | new `src/main/tray.ts`, `hotkeys.ts`; use `showOverlay/toggleOverlay/panicHide` |
| Deep stealth (per-app rules, audio privacy) | stealth agent | `src/main/stealth.ts` |

Rules of engagement:

- Extend `BarelySettings` for anything persistent; never invent ad-hoc files.
- New channels **must** go through `src/shared/ipc-contract.ts`.
- Keep `features/<domain>/` replaceable — other domains should not import
  from it.
- The app **never quits** when the overlay closes (`window-all-closed` is a
  no-op) — a tray/hotkey re-shows it; `stealth:panicHide` hides without
  exiting.

---

## Verification status (v0.1)

- `npm install` — ✅ 0 vulnerabilities (if `node_modules/electron/dist` is
  missing, run `node node_modules/electron/install.js`)
- `npm run typecheck` — ✅ zero errors (node + web projects)
- `npm run build` — ✅ `out/main` 11 kB, `out/preload` 2.6 kB, `out/renderer`
  237 kB js + 9.7 kB css
- `npm start` (15 s smoke run) — ✅ no crashes/errors; overlay window, IPC
  and settings verified over CDP (visibility events, focusable toggling,
  settings persistence, stub rejections all as designed)
