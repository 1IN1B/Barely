/**
 * Panel header: "BARELY" wordmark + drag region + hide button.
 *
 * - The header is the window drag handle (`-webkit-app-region: drag` in CSS);
 *   interactive children opt out with `.no-drag`.
 * - NO `title` attributes anywhere in the UI: native tooltips are separate OS
 *   windows and leak into screen shares (popup containment rule —
 *   see src/main/overlayWindow.ts). Use aria-label + custom in-window UI.
 */
interface OverlayHeaderProps {
  /** Invoked when the user clicks the hide button. */
  onHide: () => void;
}

export default function OverlayHeader({ onHide }: OverlayHeaderProps): JSX.Element {
  return (
    <header className="panel-header">
      <div className="wordmark" aria-label="Barely">
        BARELY
      </div>

      <div className="header-actions no-drag">
        <span className="badge badge--stealth" aria-hidden="true">
          <span className="badge__dot" />
          invisible
        </span>
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
