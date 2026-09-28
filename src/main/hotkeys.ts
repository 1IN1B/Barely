/**
 * =============================================================================
 * hotkeys.ts — global shortcuts for the stealth layer
 * =============================================================================
 *
 * Four accelerators (macOS `⌘` / Windows+Linux `Ctrl`):
 *
 *   Cmd/Ctrl+Shift+Space  toggle overlay           (uses `settings.hotkey`)
 *   Cmd/Ctrl+Shift+H      PANIC hide               (hide + focusable(false)
 *                                                   + `barely:stealth-panic`)
 *   Cmd/Ctrl+Shift+B      reveal — show + focusable (read the answer, type)
 *   Cmd/Ctrl+Shift+M      toggle the Dock icon      (macOS, no-op elsewhere)
 *
 * GRACEFUL FAILURE: `globalShortcut.register` returns false when another app
 * already owns an accelerator (or throws on a malformed string). Neither is
 * fatal — we log which bindings came up and keep running with the rest, so a
 * single conflict never takes the overlay down.
 *
 * REGISTRATION ORDER: call `registerHotkeys()` only AFTER app ready and AFTER
 * the overlay exists (src/main/index.ts does both), and `unregisterHotkeys()`
 * from `will-quit`.
 *
 * No native menus here — the only native menu in Barely is the tray's
 * (src/main/tray.ts).
 * =============================================================================
 */

import { globalShortcut } from "electron";
import { setOverlayFocusable, showOverlay, toggleOverlay } from "./overlayWindow";
import { getSettings } from "./settings";
import { applyDockVisible, isDockVisible, panicHide } from "./stealth";

/** Accelerator used when `settings.hotkey` is empty/invalid. */
const DEFAULT_TOGGLE_ACCELERATOR = "CommandOrControl+Shift+Space";

/** Fixed stealth accelerators (spec). */
export const PANIC_ACCELERATOR = "CommandOrControl+Shift+H";
export const REVEAL_ACCELERATOR = "CommandOrControl+Shift+B";
export const DOCK_ACCELERATOR = "CommandOrControl+Shift+M";

/** One registered shortcut, as reported by `getRegisteredHotkeys()`. */
export interface HotkeyInfo {
  /** Electron accelerator string, e.g. `CommandOrControl+Shift+H`. */
  accelerator: string;
  /** What the shortcut does — shown in logs / future help UI. */
  label: string;
}

/** Registered bindings of the current session. */
let registered: HotkeyInfo[] = [];

/** Toggle accelerator: the persisted `settings.hotkey`, with a safe fallback. */
function toggleAccelerator(): string {
  const configured = getSettings().hotkey?.trim();
  return configured || DEFAULT_TOGGLE_ACCELERATOR;
}

/**
 * Register every stealth hotkey. Safe to call more than once (previous
 * registrations are released first).
 */
export function registerHotkeys(): void {
  unregisterHotkeys();

  const bindings: Array<HotkeyInfo & { run: () => void }> = [
    {
      accelerator: toggleAccelerator(),
      label: "Toggle overlay",
      run: () => toggleOverlay(),
    },
    {
      accelerator: PANIC_ACCELERATOR,
      label: "Panic hide",
      run: () => panicHide(),
    },
    {
      accelerator: REVEAL_ACCELERATOR,
      label: "Show overlay + focusable",
      run: () => {
        showOverlay("show");
        setOverlayFocusable(true);
      },
    },
    {
      accelerator: DOCK_ACCELERATOR,
      label: "Toggle Dock icon",
      run: () => applyDockVisible(!isDockVisible()),
    },
  ];

  for (const binding of bindings) {
    try {
      const ok = globalShortcut.register(binding.accelerator, binding.run);
      if (ok) {
        registered.push({ accelerator: binding.accelerator, label: binding.label });
        console.log(`[barely:hotkeys] registered ${binding.accelerator} — ${binding.label}`);
      } else {
        console.warn(
          `[barely:hotkeys] ${binding.accelerator} is taken by another app — ` +
            `"${binding.label}" is unavailable this session`,
        );
      }
    } catch (err) {
      // Malformed accelerator / platform quirk: never fatal.
      console.warn(
        `[barely:hotkeys] failed to register ${binding.accelerator} ` +
          `("${binding.label}"):`,
        err,
      );
    }
  }

  if (registered.length === 0) {
    console.warn("[barely:hotkeys] no global shortcuts registered — tray still works");
  }
}

/** Release every shortcut this app registered (called from `will-quit`). */
export function unregisterHotkeys(): void {
  if (registered.length === 0) return;
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    console.warn("[barely:hotkeys] unregisterAll failed:", err);
  }
  registered = [];
}

/** Shortcuts that actually registered this session (diagnostics / help UI). */
export function getRegisteredHotkeys(): readonly HotkeyInfo[] {
  return registered;
}
