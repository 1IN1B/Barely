/**
 * Panel header: "BARELY" wordmark + drag region + invisibility switch + hide.
 *
 * - The header is the window drag handle (`-webkit-app-region: drag` in CSS);
 *   interactive children opt out with `.no-drag`.
 * - NO `title` attributes anywhere in the UI: native tooltips are separate OS
 *   windows and leak into screen shares (popup containment rule —
 *   see src/main/overlayWindow.ts). Use aria-label + custom in-window UI.
 * - The invisibility switch is a custom in-window control (`role="switch"` +
 *   CSS-animated knob) — never a `<select>`, never a native checkbox/toggle,
 *   so nothing native pops out of the panel.
 */
import { useEffect, useRef, useState } from "react";

interface OverlayHeaderProps {
  /** Invoked when the user clicks the hide button. */
  onHide: () => void;
}

/** How long the "visible in recordings" warning stays on the badge. */
const FLASH_MS = 1800;

export default function OverlayHeader({ onHide }: OverlayHeaderProps): JSX.Element {
  // Optimistic default: invisibility ships ON; mount syncs with main.
  const [invisible, setInvisible] = useState(true);
  // Transient warning text shown after switching invisibility OFF.
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  // Initialize from main (`overlay:invisibilityState`) on mount.
  useEffect(() => {
    let cancelled = false;
    window.barely.overlay
      .invisibilityState()
      .then((state) => {
        if (!cancelled) setInvisible(state.enabled);
      })
      .catch((err: unknown) => {
        console.error("[barely] failed to read invisibility state:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear the pending flash timer when the header unmounts.
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const toggleInvisibility = (): void => {
    const next = !invisible;
    setInvisible(next); // optimistic — confirmed from the handler's result
    window.barely.overlay
      .setInvisibility({ enabled: next })
      .then((state) => {
        setInvisible(state.enabled);
        if (flashTimer.current !== null) {
          window.clearTimeout(flashTimer.current);
          flashTimer.current = null;
        }
        if (state.enabled) {
          setFlash(null);
        } else {
          // Nice touch: shout it — the overlay is now capturable.
          setFlash("visible in recordings");
          flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
        }
      })
      .catch((err: unknown) => {
        console.error("[barely] failed to toggle invisibility:", err);
        setInvisible(!next); // roll back the optimistic update
      });
  };

  const label = flash ?? (invisible ? "invisible" : "visible");
  const badgeClass = invisible
    ? "badge badge--ok"
    : flash
      ? "badge badge--warn badge--flash"
      : "badge badge--warn";

  return (
    <header className="panel-header">
      <div className="wordmark" aria-label="Barely">
        BARELY
      </div>

      <div className="header-actions no-drag">
        <span className={badgeClass} aria-live="polite">
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={invisible}
          aria-label="Screen-recording invisibility"
          className="invis-switch"
          onClick={toggleInvisibility}
        >
          <span className="invis-switch__knob" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onHide}
          aria-label="Hide overlay"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M1 6h10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
