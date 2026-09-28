/**
 * =============================================================================
 * stealth.ts — content protection, dock presence and panic-hide helpers
 * =============================================================================
 *
 * Responsibilities:
 *  - `setContentProtection` / `reassertContentProtection`: the screen-share
 *    exclusion primitive (macOS NSWindowSharingNone / Windows
 *    WDA_EXCLUDEFROMCAPTURE). AppKit can reset it, so it is re-asserted after
 *    construction, on `ready-to-show`, and after every `show()` — see
 *    src/main/overlayWindow.ts for the full rule and the POPUP CONTAINMENT
 *    caveat (native menus/tooltips leak because they are separate windows).
 *  - Dock visibility toggle (macOS): `app.dock.hide()` / `app.dock.show()`.
 *    Exposed to the renderer as `stealth:setDockVisible`; `applyDockVisible()`
 *    persists the preference (`BarelySettings.dockVisible`) and restores the
 *    overlay's exact show/hide state afterwards (see OVERLAY BRIDGE below).
 *  - `panicHide()`: instantly hide every registered (protected) window, blur
 *    focused inputs and push `barely:stealth-panic` so the renderer clears
 *    transient UI (chat composer, popovers). Exposed as `stealth:panicHide`
 *    and bound to a global hotkey + the tray menu (src/main/hotkeys.ts,
 *    src/main/tray.ts).
 *  - Auto-fade: `configureAutoHide(seconds)` hides the overlay after N seconds
 *    without renderer interaction (`BarelySettings.autoHideSeconds`, 0 = off).
 *    The renderer pings `overlay:userActivity` -> `noteUserActivity()`.
 *
 * OVERLAY BRIDGE (why this module still never imports ./overlayWindow):
 *   overlayWindow.ts -> stealth.ts is a one-way dependency (content protection
 *   lives over there). To avoid inverting it, overlayWindow.ts REGISTERs its
 *   show/hide/focusable primitives here at load time via
 *   `registerOverlayBridge()`. Everything below uses the bridge when it needs
 *   overlay state, and tolerates `null` before it is registered.
 *
 * REGISTERING WINDOWS: any future Barely window that must stay out of screen
 * shares should be passed to `registerProtectedWindow()` so `panicHide()`
 * covers it too (settings windows, ...).
 * =============================================================================
 */

import { app, BrowserWindow } from "electron";
import {
  CHANNELS,
  type OverlayVisibilityEvent,
  type StealthPanicEvent,
} from "../shared/ipc-contract";
import { updateSettings } from "./settings";

/** Windows that participate in stealth (protected + panic-hidden). */
const protectedWindows = new Set<BrowserWindow>();

/* -------------------------------------------------------------------------- */
/* Overlay bridge (registered by overlayWindow.ts — keeps imports one-way)     */
/* -------------------------------------------------------------------------- */

/** Show/hide/focusable primitives of the overlay, registered by its module. */
export interface OverlayBridge {
  isVisible(): boolean;
  show(reason?: OverlayVisibilityEvent["reason"]): void;
  hide(reason?: OverlayVisibilityEvent["reason"]): void;
  setFocusable(focusable: boolean): void;
}

let overlayBridge: OverlayBridge | null = null;

/** Called once by overlayWindow.ts at module load. */
export function registerOverlayBridge(bridge: OverlayBridge): void {
  overlayBridge = bridge;
}

/** Track a window for `panicHide()`. Safe to call multiple times. */
export function registerProtectedWindow(win: BrowserWindow): void {
  protectedWindows.add(win);
}

/** Stop tracking a window (call from the window's `closed` handler). */
export function unregisterProtectedWindow(win: BrowserWindow): void {
  protectedWindows.delete(win);
}

/**
 * Turn content protection ON/OFF for a window.
 * Prefer `reassertContentProtection()` at the call sites that matter —
 * this raw setter exists for agents that need to toggle it off (debugging).
 */
export function setContentProtection(win: BrowserWindow, enabled: boolean): void {
  if (win.isDestroyed()) return;
  win.setContentProtection(enabled);
}

/**
 * Idempotent (re)application of content protection. Call after construction,
 * on `ready-to-show`, and after every `show()` — AppKit can silently reset
 * the sharing state. This is THE core screen-share exclusion call.
 */
export function reassertContentProtection(win: BrowserWindow): void {
  setContentProtection(win, true);
}

/** macOS: show the Dock icon. No-op on other platforms / when unavailable. */
export function setDockVisible(visible: boolean): void {
  if (process.platform !== "darwin" || !app.dock) return;
  if (visible) app.dock.show();
  else app.dock.hide();
}

/** macOS: whether the Dock icon is currently visible. `false` elsewhere. */
export function isDockVisible(): boolean {
  if (process.platform !== "darwin" || !app.dock) return false;
  return app.dock.isVisible();
}

/**
 * Dock toggle that (a) preserves the overlay's exact show/hide state — macOS
 * can re-activate the app while the Dock icon appears/disappears, which would
 * fire `activate` -> showOverlay — and (b) persists the preference.
 * This is the one dock entry point used by IPC, the hotkey and the tray.
 */
export function applyDockVisible(visible: boolean, persist = true): boolean {
  const wasVisible = overlayBridge?.isVisible() ?? false;
  setDockVisible(visible);
  const nowVisible = overlayBridge?.isVisible() ?? false;
  if (overlayBridge && wasVisible !== nowVisible) {
    if (wasVisible) overlayBridge.show("show");
    else overlayBridge.hide("hide");
  }
  if (persist) updateSettings({ dockVisible: visible });
  return isDockVisible();
}

/**
 * Instantly hide every registered protected window.
 * The overlay stays alive (just hidden) so it can be re-shown immediately.
 *
 * Panic sequence (order matters):
 *   1. blur the focused window (drops keyboard focus right away),
 *   2. push `barely:stealth-panic` so the renderer blurs inputs and clears
 *      transient UI (chat composer, in-window popovers) — sent BEFORE the
 *      hide so the renderer still paints the cleanup,
 *   3. kill focusability (focus hygiene: a hidden overlay never keeps focus),
 *   4. hide every protected window (each fires its `hide` event ->
 *      `barely:overlay-visibility`, re-asserting focus hygiene too).
 *
 * TODO (deep stealth agent): also consider disabling `alwaysOnTop` here if a
 * future "stealth mode" should drop the window below others.
 */
export function panicHide(): void {
  const payload: StealthPanicEvent = { at: Date.now() };
  for (const win of [...protectedWindows]) {
    if (win.isDestroyed()) continue;
    if (win.isFocused()) win.blur();
    // Direct send: importing ./ipc.ts for sendToOverlay would be a cycle
    // (ipc.ts imports this module). Same webContents.send under the hood.
    if (!win.webContents.isDestroyed()) {
      win.webContents.send(CHANNELS.STEALTH_PANIC_EVENT, payload);
    }
  }
  overlayBridge?.setFocusable(false);
  for (const win of [...protectedWindows]) {
    if (!win.isDestroyed() && win.isVisible()) win.hide();
  }
}

/* -------------------------------------------------------------------------- */
/* Auto-fade — hide after N seconds without renderer interaction               */
/* -------------------------------------------------------------------------- */

/** Configured idle timeout in seconds (0 = disabled). */
let autoHideSeconds = 0;
/** Last time the renderer signalled interaction (or the overlay was hidden). */
let lastActivityAt = Date.now();
let autoHideTimer: NodeJS.Timeout | null = null;

/**
 * Arm/disarm the auto-fade heuristic (`BarelySettings.autoHideSeconds`).
 * `<= 0` disables it. While the overlay is hidden the countdown is held in
 * reset state, so a fresh `show()` always gets the full grace period.
 * Idempotent — safe to call again whenever the setting changes.
 */
export function configureAutoHide(seconds: number): void {
  const next = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  autoHideSeconds = next;
  if (autoHideTimer) {
    clearInterval(autoHideTimer);
    autoHideTimer = null;
  }
  if (next <= 0) return;
  lastActivityAt = Date.now();
  autoHideTimer = setInterval(() => {
    const bridge = overlayBridge;
    if (!bridge) return;
    if (!bridge.isVisible()) {
      lastActivityAt = Date.now(); // grace period starts when it is shown
      return;
    }
    if (Date.now() - lastActivityAt >= autoHideSeconds * 1000) {
      lastActivityAt = Date.now();
      bridge.hide("hide"); // emits barely:overlay-visibility (reason: hide)
    }
  }, 1000);
  autoHideTimer.unref?.(); // never keeps the process alive on its own
}

/** Renderer interaction (`overlay:userActivity`) — resets the auto-fade clock. */
export function noteUserActivity(): void {
  lastActivityAt = Date.now();
}

/** Whether auto-fade is currently armed (> 0 seconds). */
export function isAutoHideEnabled(): boolean {
  return autoHideSeconds > 0;
}
