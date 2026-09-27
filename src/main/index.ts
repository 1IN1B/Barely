/**
 * =============================================================================
 * index.ts — Electron main process entry
 * =============================================================================
 *
 * Lifecycle:
 *   requestSingleInstanceLock -> app ready -> (menu cleared) -> register IPC
 *   -> create overlay window -> show when renderer is ready (unless
 *   settings.startHidden) -> keep the app alive while the overlay is hidden
 *   (a tray/hotkey agent will manage reopening; see below).
 *
 * Single instance: a second launch signals the first and re-shows the overlay
 * instead of spawning a duplicate process.
 * =============================================================================
 */

import { app, Menu } from "electron";
import { registerIpcHandlers } from "./ipc";
import { createOverlayWindow, getOverlayWindow, showOverlay } from "./overlayWindow";
import { getSettings } from "./settings";
import { setDockVisible } from "./stealth";

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
      // SECURITY/UX: no native menus anywhere — native context menus and the
      // app menu are separate windows that would leak into screen shares
      // (see the popup containment rule in src/main/overlayWindow.ts).
      Menu.setApplicationMenu(null);

      registerIpcHandlers(); // overlay + settings + stealth handlers (chat/voice stubs)
      const settings = getSettings();

      // Hidden tray-ready state: the dock starts hidden on macOS (MVP default).
      // The stealth agent can expose a toggle via `stealth:setDockVisible`.
      setDockVisible(false);

      const win = createOverlayWindow();
      if (!settings.startHidden) {
        if (win.webContents.isLoading()) {
          win.webContents.once("did-finish-load", () => showOverlay("startup"));
        } else {
          showOverlay("startup");
        }
      }

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
  // closed — a tray / global hotkey (other agents) re-shows it. This also
  // keeps `panicHide` meaningful: hiding windows is not exiting.
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

  // Security hygiene: deny any webContents navigation attempts.
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event) => event.preventDefault());
  });
}
