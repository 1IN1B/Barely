/**
 * =============================================================================
 * overlayWindow.ts — creation & lifecycle of the invisible overlay BrowserWindow
 * =============================================================================
 *
 * THE INVISIBILITY CORE (research-backed, do not "simplify" these away):
 *
 * 1. `contentProtection(true)` (macOS: NSWindowSharingNone,
 *    Windows: WDA_EXCLUDEFROMCAPTURE) is what keeps Barely out of screen
 *    shares, screen recordings and screenshots of THIS window.
 *
 *    CRITICAL: AppKit can silently RESET content protection. It must be
 *    re-asserted (a) right after construction, (b) on `ready-to-show`, and
 *    (c) after EVERY `show()` call. `reassertContentProtection()` below does
 *    exactly that — call it any time the window's sharing state may have
 *    been touched (see also src/main/stealth.ts).
 *
 * 2. POPUP CONTAINMENT RULE (learned from Pluely v1.1.0):
 *    Content protection covers ONLY this BrowserWindow. Native OS popups —
 *    context menus, tooltips, select dropdowns, autocomplete lists — are
 *    SEPARATE native windows and WILL LEAK into screen captures even though
 *    the overlay itself is hidden. Therefore:
 *      - We NEVER allow native context menus: the webContents `context-menu`
 *        event is cancelled below and any handler added must keep it that way.
 *      - All menus/dropdowns/tooltips MUST be custom in-window React
 *        components (plain divs), never `<select>`, never Electron `Menu`,
 *        never `title=`-style OS tooltips.
 *      - We NEVER call `win.setMenu(...)`; the app menu is null
 *        (`Menu.setApplicationMenu(null)` in src/main/index.ts).
 *
 * 3. `focusable: false` gives a click-through-ish overlay that cannot steal
 *    keyboard focus from the user's real work. When the user opens chat input,
 *    the renderer calls `barely.overlay.setFocusable(true)` -> `setFocusable(true)`
 *    + `focus()`. Set it back to false when the input closes.
 *
 * 4. `setAlwaysOnTop(true, 'screen-saver')` keeps the overlay above full-screen
 *    apps and most other windows (screen-saver is a very high window level).
 *
 * 5. macOS: `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
 *    so the overlay follows the user across Spaces / fullscreen apps.
 *    `app.dock.hide()` is toggled from stealth (`stealth:setDockVisible`).
 *
 * Tray icon + global hotkeys are OTHER AGENTS' responsibility; this module
 * only exports the show/hide/toggle/focusable primitives they should call.
 * =============================================================================
 */

import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { CHANNELS, type OverlayVisibilityEvent, type OverlayWindowState } from "../shared/ipc-contract";
import { reassertContentProtection, registerProtectedWindow, unregisterProtectedWindow } from "./stealth";

/** Overlay geometry (DIPs) — matches the compact panel design. */
export const OVERLAY_SIZE = { width: 460, height: 420 } as const;

let overlayWindow: BrowserWindow | null = null;
let overlayFocusable = false;

/**
 * Reason reported with the NEXT show/hide event. `show()`/`hide()` emit via
 * the window's native `show`/`hide` events (single source of visibility
 * truth), so callers that want a different `reason` stash it here first.
 */
let pendingShowReason: OverlayVisibilityEvent["reason"] | null = null;
let pendingHideReason: OverlayVisibilityEvent["reason"] | null = null;

/**
 * Create the overlay window (idempotent — returns the existing instance).
 * The window is created hidden; call `showOverlay()` to display it.
 */
export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  const { width, height } = OVERLAY_SIZE;
  const workArea = screen.getPrimaryDisplay().workArea;
  // Top-center placement: reads as a "HUD" over whatever app is focused.
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + Math.max(48, workArea.height * 0.08));

  overlayFocusable = false;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true, // lets the rounded panel float over other windows
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: true,
    show: false, // shown via showOverlay() after ready-to-show
    alwaysOnTop: true, // re-asserted at the 'screen-saver' level below
    skipTaskbar: true,
    focusable: false, // click-through-ish until the user opens chat input
    acceptFirstMouse: true, // first click passes through (macOS)
    hasShadow: false, // the panel draws its own shadow
    title: "Barely",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // --- Invisibility assertions (see file header, points 1 + 4 + 5) ---
  reassertContentProtection(win);
  win.setAlwaysOnTop(true, "screen-saver");

  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // --- Load the renderer (dev server URL vs. built file) ---
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void win.loadURL(rendererUrl); // `electron-vite dev`
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html")); // built output
  }

  registerProtectedWindow(win);

  // --- Re-assert after the renderer is ready (AppKit may reset it) ---
  win.once("ready-to-show", () => {
    reassertContentProtection(win);
  });

  // --- Re-assert after every show(); mirror visibility into the renderer ---
  win.on("show", () => {
    reassertContentProtection(win);
    emitVisibility(true, pendingShowReason ?? "show");
    pendingShowReason = null;
  });
  win.on("hide", () => {
    emitVisibility(false, pendingHideReason ?? "hide");
    pendingHideReason = null;
  });

  // --- POPUP CONTAINMENT: kill every native context menu (file header, pt. 2) ---
  win.webContents.on("context-menu", (event) => {
    // Native menus are SEPARATE windows: they are not content-protected and
    // would leak into screen shares. UI must render custom in-window menus.
    event.preventDefault();
  });

  // Never spawn auxiliary windows (native popups leak — see header).
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  win.on("closed", () => {
    unregisterProtectedWindow(win);
    overlayWindow = null;
    overlayFocusable = false;
  });

  overlayWindow = win;
  return win;
}

/** The overlay instance (or null before creation / after close). */
export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null;
}

/** Show the overlay (re-asserting content protection afterwards). */
export function showOverlay(reason: OverlayVisibilityEvent["reason"] = "show"): void {
  const win = createOverlayWindow();
  if (win.isVisible()) return; // already visible — state is in sync
  pendingShowReason = reason;
  win.show();
  // The `show` listener re-asserts, but belt-and-braces per file header point 1.
  reassertContentProtection(win);
}

/** Hide the overlay (used by panic hide, tray and `overlay:hide`). */
export function hideOverlay(reason: OverlayVisibilityEvent["reason"] = "hide"): void {
  const win = getOverlayWindow();
  if (!win?.isVisible()) return;
  pendingHideReason = reason;
  win.hide();
}

/** Toggle overlay visibility. Returns the resulting state. */
export function toggleOverlay(): void {
  const win = getOverlayWindow();
  if (win?.isVisible()) hideOverlay("toggle");
  else showOverlay("toggle");
}

/**
 * Make the overlay accept (or refuse) keyboard focus.
 * Renderer calls this with `true` when chat input opens, `false` when it
 * closes, restoring the click-through-ish behaviour.
 */
export function setOverlayFocusable(focusable: boolean): void {
  const win = createOverlayWindow();
  overlayFocusable = focusable;
  win.setFocusable(focusable);
  if (focusable) win.focus();
}

/** Current visibility. */
export function isOverlayVisible(): boolean {
  return getOverlayWindow()?.isVisible() ?? false;
}

/** Current focusable flag. */
export function isOverlayFocusable(): boolean {
  return overlayFocusable;
}

/** Snapshot used as the result payload of every overlay invoke channel. */
export function getOverlayState(): OverlayWindowState {
  const win = getOverlayWindow();
  const bounds = win ? win.getBounds() : { x: 0, y: 0, width: OVERLAY_SIZE.width, height: OVERLAY_SIZE.height };
  return { visible: isOverlayVisible(), focusable: overlayFocusable, bounds };
}

/** Push `barely:overlay-visibility` to the renderer (no-op before it loads). */
function emitVisibility(visible: boolean, reason: OverlayVisibilityEvent["reason"]): void {
  const win = getOverlayWindow();
  if (!win || win.isDestroyed()) return;
  const payload: OverlayVisibilityEvent = { visible, reason };
  win.webContents.send(CHANNELS.OVERLAY_VISIBILITY_EVENT, payload);
}
