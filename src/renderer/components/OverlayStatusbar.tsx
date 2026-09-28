/**
 * Footer status row: panic-hide hint (left) + model badge (right).
 */
interface OverlayStatusbarProps {
  /** Active model id from settings (undefined until settings load). */
  model?: string;
}

export default function OverlayStatusbar({
  model,
}: OverlayStatusbarProps): JSX.Element {
  return (
    <footer className="panel-status">
      <span className="status-left">
        <span className="status-label">
          Panic hide
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
