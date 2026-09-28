/**
 * =============================================================================
 * focus.ts — overlay focus-lock helpers shared by every typing surface
 * =============================================================================
 *
 * THE BUG THIS MODULE EXISTS TO FIX (focus chicken-and-egg on macOS):
 *
 *   The overlay BrowserWindow is created `focusable: false` on purpose — it
 *   must never steal keyboard focus from the user's real work. On macOS that
 *   means the NSWindow can never become the KEY window, so:
 *
 *     click an <input>  ->  DOM focus is never granted to it
 *                        ->  React `onFocus` never fires
 *                        ->  `setFocusable(true)` is never called
 *                        ->  the window stays non-focusable -> typing impossible.
 *
 *   `onFocus` can therefore never trigger the state it needs: it is the wrong
 *   event for the *first* unlock. The unlock has to happen on the way IN —
 *   on pointer-down, BEFORE the browser tries to focus the control.
 *
 * THE FIX (three layers, see ChatSettings.tsx / ChatTab.tsx / VoiceTab.tsx and
 * main's `setOverlayFocusable`):
 *
 *   1. pointer-down unlock (this file) — `unlockFocusForControl()` fires the
 *      IPC first, then (once main has made the window key) guarantees DOM
 *      focus if the click did not land.
 *   2. focus-lock while a typing surface is open — ChatSettings keeps the
 *      window focusable for its whole mount lifetime; the composer unlocks on
 *      pointer-down capture.
 *   3. main-side ordering: `setFocusable(true)` -> `focus()` ->
 *      `webContents.focus()`.
 *
 * RE-LOCK RULE (shared by every blur path): NEVER set `focusable(false)` when
 * focus is moving to another input/textarea/button inside the panel — that is
 * exactly the "click Save while an input is focused" case, and re-locking
 * there would fight the control that is about to receive focus.
 * =============================================================================
 */

/** Structural shape of the React pointer/mouse event we need. */
interface PointerLikeEvent {
  currentTarget: HTMLElement;
}

/** Controls that want the overlay window to stay focusable. */
function isTypingControl(el: Element | null): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "BUTTON" ||
      el.isContentEditable)
  );
}

/**
 * Bare pointer-down unlock — call from a container's `onPointerDownCapture`
 * so ANY press inside it (input, button, label, padding) makes the window
 * focusable before the browser attempts to focus anything.
 */
export function unlockOverlayFocus(): void {
  void window.barely.overlay.setFocusable(true).catch(() => undefined);
}

/**
 * PRIMARY FIX — pointer-down unlock for a single text control.
 *
 * Sequence: pointerdown -> IPC -> main `setFocusable(true)` + `focus()` ->
 * window is key -> the pending click focuses the input -> typing works.
 *
 * Belt-and-braces: when the IPC resolves we check whether anything is
 * actually focused; if the click has not landed yet (or could not land
 * because the window was still non-focusable at mouse-up), we focus the
 * control ourselves. `setFocusable(true)` already made the window key, so
 * this `focus()` is guaranteed to stick.
 */
export function unlockFocusForControl(event: PointerLikeEvent): void {
  unlockAndFocusControl(event.currentTarget);
}

/**
 * Same contract as `unlockFocusForControl`, for programmatic focuses (the
 * voice -> chat transcript hand-off, which focuses the composer without any
 * click at all).
 */
export function unlockAndFocusControl(target: HTMLElement): void {
  void window.barely.overlay
    .setFocusable(true)
    .then(() => {
      const active = document.activeElement;
      if (isTypingControl(active)) return; // already focused
      target.focus({ preventScroll: true });
    })
    .catch(() => undefined);
}

/**
 * Guarded re-lock, to be called from a control's `onBlur`.
 *
 * The blur may be *caused by* clicking the next control (Save, a provider
 * tile, the next field…). Focus has not settled at blur time, so we wait one
 * frame and only then re-lock — and only if focus landed OUTSIDE `root` (or
 * on something that is not a control at all).
 *
 * `onKept` reports the decision so callers can mirror it in their own refs
 * (ChatTab's `focusRef` drives the unmount cleanup).
 */
export function relockAfterBlur(
  root: HTMLElement | null,
  onKept?: (keepFocusable: boolean) => void,
): void {
  const decide = (active: Element | null): boolean =>
    isTypingControl(active) && root !== null && root.contains(active);

  // One frame later: React/the browser has finished moving focus.
  window.requestAnimationFrame(() => {
    const keep = decide(document.activeElement);
    onKept?.(keep);
    if (!keep) void window.barely.overlay.setFocusable(false).catch(() => undefined);
  });
}
