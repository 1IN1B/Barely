/**
 * =============================================================================
 * tray.ts — menu-bar icon (the ONE allowed native menu in Barely)
 * =============================================================================
 *
 * The popup containment rule bans native menus everywhere EXCEPT the tray:
 * a tray menu lives in the menu bar (not floating over the user's work), it is
 * the only practical way to quit a dock-less overlay, and Electron offers no
 * in-window equivalent. This is the documented exception — no other native
 * menus exist in the app.
 *
 * Interaction:
 *   - LEFT click  -> toggle the overlay
 *   - RIGHT click -> popup the menu:
 *       Show/Hide overlay · Panic Hide · Dock icon on/off · Quit
 *   (Linux has no `right-click` tray event, so the menu is attached there and
 *    shows on left click instead — platform default behaviour.)
 *
 * ICON: a 16x16 PNG embedded as base64 (no asset file to ship / lose), marked
 * as a macOS TEMPLATE image so the menu bar paints it black-on-light /
 * white-on-dark automatically.
 *
 * Labels refresh whenever the overlay's visibility changes
 * (`onOverlayVisibilityChange` from overlayWindow.ts), so "Show" / "Hide" is
 * never stale.
 * =============================================================================
 */

import { Menu, Tray, app, nativeImage, type MenuItemConstructorOptions } from "electron";
import {
  isOverlayVisible,
  onOverlayVisibilityChange,
  toggleOverlay,
} from "./overlayWindow";
import { applyDockVisible, isDockVisible, panicHide } from "./stealth";

/**
 * 16x16 RGBA PNG (transparent background, black ring + slash), generated once
 * and inlined so the tray works in packaged builds without extra resources.
 */
const TRAY_ICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAj0lEQVR42r1TwQ3AIAjk5xoO4Qpuxwb9" +
  "Oghz9dPSBBJLBds0LcnFRDg8DwX4IAqDGCtjk5VkfxpNSB6OPApC8sLIjCTrYhrhSLYmq6MOu5rLdag7" +
  "OSKrErIFalgOyCh5NfYUKi0FZJC81k4V4MAwV4H1AB23XQ+KGdGIXKMpPHkHDW7MOXqJEDXAt3/h/9gBz" +
  "lhXaymjEVIAAAAASUVORK5CYII=";

let tray: Tray | null = null;
let unsubscribeVisibility: (() => void) | null = null;

/** Create the tray icon (idempotent — returns the existing instance). */
export function createTray(): Tray | null {
  if (tray && !tray.isDestroyed()) return tray;

  try {
    const image = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, "base64"));
    if (image.isEmpty()) {
      console.warn("[barely:tray] embedded icon failed to decode — continuing without pixels");
    }
    if (process.platform === "darwin") image.setTemplateImage(true); // menu-bar adaptive

    tray = new Tray(image);
  } catch (err) {
    // No status bar / tray unavailable (e.g. some Linux sessions): hotkeys
    // still cover show/hide/panic, so this is non-fatal.
    console.warn("[barely:tray] unavailable on this system:", err);
    tray = null;
    return null;
  }

  tray.on("click", () => {
    console.log("[barely:tray] left click -> toggle overlay");
    toggleOverlay();
  });

  tray.on("right-click", () => {
    console.log("[barely:tray] right click -> menu");
    tray?.popUpContextMenu(buildMenu());
  });

  // Keep "Show"/"Hide" honest across hotkey / IPC / renderer driven changes.
  unsubscribeVisibility = onOverlayVisibilityChange(() => {
    refreshTrayMenu();
  });

  if (process.platform === "linux") {
    // Linux never emits `right-click` for tray icons — attach the menu so it
    // opens on activation instead.
    tray.setContextMenu(buildMenu());
  }

  console.log("[barely:tray] ready");
  return tray;
}

/** Rebuild + reattach the menu (labels reflect current show/dock state). */
export function refreshTrayMenu(): void {
  if (!tray || tray.isDestroyed()) return;
  if (process.platform === "linux") tray.setContextMenu(buildMenu());
}

/** Destroy the tray icon (called from `will-quit`). */
export function destroyTray(): void {
  unsubscribeVisibility?.();
  unsubscribeVisibility = null;
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

/** The tray instance (diagnostics/tests). */
export function getTray(): Tray | null {
  return tray && !tray.isDestroyed() ? tray : null;
}

/* -------------------------------------------------------------------------- */
/* Menu                                                                        */
/* -------------------------------------------------------------------------- */

function buildMenu(): Menu {
  const visible = isOverlayVisible();
  const dockVisible = isDockVisible();

  const template: MenuItemConstructorOptions[] = [
    {
      label: visible ? "Hide overlay" : "Show overlay",
      click: () => {
        toggleOverlay();
        refreshTrayMenu();
      },
    },
    {
      label: "Panic hide",
      click: () => panicHide(),
    },
    { type: "separator" },
    {
      label: dockVisible ? "Hide Dock icon" : "Show Dock icon",
      click: () => {
        applyDockVisible(!dockVisible);
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Quit Barely",
      click: () => app.quit(),
    },
  ];

  return Menu.buildFromTemplate(template);
}
