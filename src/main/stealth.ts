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
 *    Exposed to the renderer as `stealth:setDockVisible`.
 *  - `panicHide()`: instantly hide every registered (protected) window.
 *    Exposed as `stealth:panicHide` — wire it to a hotkey/tray item later.
 *
 * REGISTERING WINDOWS: any future Barely window that must stay out of screen
 * shares should be passed to `registerProtectedWindow()` so `panicHide()`
 * covers it too (tray popups, settings windows, ...).
 *
 * NOTE: this module deliberately does NOT import ./overlayWindow (avoiding a
 * circular import) — it tracks windows in its own registry instead.
 * =============================================================================
 */

import { app, BrowserWindow } from "electron";

/** Windows that participate in stealth (protected + panic-hidden). */
const protectedWindows = new Set<BrowserWindow>();

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
 * Instantly hide every registered protected window.
 * The overlay stays alive (just hidden) so it can be re-shown immediately.
 * TODO (hotkey/tray agent): also consider disabling `alwaysOnTop` here if a
 * future "stealth mode" should drop the window below others.
 */
export function panicHide(): void {
  for (const win of [...protectedWindows]) {
    if (!win.isDestroyed() && win.isVisible()) win.hide();
  }
}
