/**
 * =============================================================================
 * index.ts — Electron main process entry
 * =============================================================================
 *
 * Lifecycle:
 *   requestSingleInstanceLock -> app ready -> (menu cleared) -> register IPC
 *   -> create overlay window -> show when renderer is ready (unless
 *   settings.startHidden) -> register global hotkeys + tray (stealth layer)
 *   -> keep the app alive while the overlay is hidden (tray/hotkey re-show it;
 *   the app only exits via the tray's Quit / Cmd+Q).
 *
 * Setup order matters: the overlay exists FIRST (hotkeys/tray act on it and
 * every IPC invoke needs a window to answer), then the stealth controls come
 * up once the app is ready (globalShortcut/Tray are ready-to-use APIs only
 * after `ready`).
 *
 * Single instance: a second launch signals the first and re-shows the overlay
 * instead of spawning a duplicate process.
 * =============================================================================
 */

import { app, Menu } from "electron";
import { registerHotkeys, unregisterHotkeys } from "./hotkeys";
import { registerIpcHandlers } from "./ipc";
import { createOverlayWindow, getOverlayWindow, showOverlay } from "./overlayWindow";
import { getSettings } from "./settings";
import { configureAutoHide, setDockVisible } from "./stealth";
import { createTray, destroyTray } from "./tray";

/* ------------------------- single-instance lock -------------------------- */
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  // Another Barely is running — exit quietly; the first instance focuses.
  app.quit();
} else {
  app.on("second-instance", () => {
    showOverlay("show");
  });

  /* ------------------------------ startup ------------------------------- */
  app.whenReady().then(() => {
    try {
      // SECURITY/UX: no native menus anywhere except the tray — native context
      // menus and the app menu are separate windows that would leak into
      // screen shares (see the popup containment rule in overlayWindow.ts).
      Menu.setApplicationMenu(null);

      // 1. IPC hub first: `registerIpcHandlers()` also creates the overlay
      //    window, so every `window.barely.*` call has a target to talk to.
      registerIpcHandlers();
      const settings = getSettings();

      // 2. Stealth state from persisted settings: dock presence + auto-fade
      //    (`autoHideSeconds`, default 0 = off; the renderer's activity pings
      //    keep it alive only when the user turns it on).
      setDockVisible(settings.dockVisible); // never re-persists at startup
      configureAutoHide(settings.autoHideSeconds);

      // 3. The overlay itself (idempotent — step 1 already created it).
      const win = createOverlayWindow();
      if (!settings.startHidden) {
        if (win.webContents.isLoading()) {
          win.webContents.once("did-finish-load", () => showOverlay("startup"));
        } else {
          showOverlay("startup");
        }
      }

      // 4. Global hotkeys + tray — only now that the overlay exists.
      //    Both fail soft (logged) if the platform refuses them.
      registerHotkeys();
      createTray();

      // Dev convenience: open DevTools when BARELY_DEVTOOLS=1.
      if (process.env.BARELY_DEVTOOLS === "1") {
        win.webContents.once("did-finish-load", () => win.webContents.openDevTools({ mode: "detach" }));
      }
    } catch (err) {
      console.error("[barely] failed to start:", err);
      app.quit();
    }
  });

  /* ----------------------------- app lifecycle -------------------------- */
  // The overlay is a persistent companion: NEVER quit when all windows are
  // closed — the tray / global hotkeys re-show it. This also keeps
  // `panicHide` meaningful: hiding windows is not exiting.
  app.on("window-all-closed", () => {
    // intentionally no app.quit()
  });

  app.on("activate", () => {
    // macOS: clicking the (re-enabled) dock icon re-shows the overlay.
    if (!getOverlayWindow()) createOverlayWindow();
    showOverlay("show");
  });

  app.on("before-quit", () => {
    const win = getOverlayWindow();
    if (win && !win.isDestroyed()) win.destroy();
  });

  // Release OS-level registrations last: shortcuts are process-wide and must
  // never outlive us (a leaked globalShortcut blocks the next launch's binding).
  app.on("will-quit", () => {
    unregisterHotkeys();
    destroyTray();
  });

  // Security hygiene: deny any webContents navigation attempts.
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
  });
}
