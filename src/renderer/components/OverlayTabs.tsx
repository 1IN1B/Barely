/**
 * Tab switcher (Chat / Voice). Placeholder wiring — content lives in
 * `src/renderer/features/*` which their agents own/replace.
 */
export type TabId = "chat" | "voice";

interface OverlayTabsProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "voice", label: "Voice" },
];

export default function OverlayTabs({
  active,
  onChange,
}: OverlayTabsProps): JSX.Element {
  return (
    <div className="tabs" role="tablist" aria-label="Barely modes">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={active === id}
          aria-controls={`panel-${id}`}
          className={`tab${active === id ? " tab--active" : ""}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
