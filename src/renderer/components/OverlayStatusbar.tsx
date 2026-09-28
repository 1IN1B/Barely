/**
 * Footer status row: stealth status dot (left) + model badge (right).
 */
interface OverlayStatusbarProps {
  /** Overlay visibility as reported by `barely:overlay-visibility`. */
  visible: boolean;
  /** Active model id from settings (undefined until settings load). */
  model?: string;
}

export default function OverlayStatusbar({
  visible,
  model,
}: OverlayStatusbarProps): JSX.Element {
  return (
    <footer className="panel-status">
      <span className="status-left">
        <span
          className={`status-dot${visible ? "" : " status-dot--off"}`}
          aria-hidden="true"
        />
        <span className="status-label">
          {visible ? "stealth active" : "hidden"}
        </span>
        {/* Global panic shortcut (registered in src/main/hotkeys.ts). */}
        <span className="hotkey-chip">⌘⇧H hide</span>
      </span>
      <span className="status-right">
        {model ? (
          <span className="model-chip">{model}</span>
        ) : (
          <span className="model-chip model-chip--dim">no model</span>
        )}
        <span className="local-chip">local</span>
      </span>
    </footer>
  );
}
