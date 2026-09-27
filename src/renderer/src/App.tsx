import { useEffect, useState } from "react";
import OverlayHeader from "../components/OverlayHeader";
import OverlayTabs, { type TabId } from "../components/OverlayTabs";
import OverlayStatusbar from "../components/OverlayStatusbar";
import ChatTab from "../features/chat/ChatTab";
import VoiceTab from "../features/voice/VoiceTab";
import type { BarelySettings } from "../../shared/ipc-contract";

/**
 * Barely overlay — compact always-on-top panel.
 *
 * Layout: header (drag region + wordmark) -> tabs -> tab content -> statusbar.
 * Feature UIs live in `features/*` and are owned by their respective agents.
 */
export default function App(): JSX.Element {
  const [tab, setTab] = useState<TabId>("chat");
  const [settings, setSettings] = useState<BarelySettings | null>(null);
  const [visible, setVisible] = useState<boolean>(true);

  // Wire up main -> renderer events + load settings once on mount.
  useEffect(() => {
    let cancelled = false;
    window.barely.settings
      .get()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((err) => console.error("[barely] failed to load settings:", err));

    const unsubscribe = window.barely.overlay.onVisibility((event) => {
      setVisible(event.visible);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleHide = (): void => {
    void window.barely.overlay.hide();
  };

  return (
    <div className="overlay-shell">
      <div className="panel">
        <OverlayHeader onHide={handleHide} />
        <OverlayTabs active={tab} onChange={setTab} />

        <main className="panel-content" role="tabpanel">
          {tab === "chat" ? <ChatTab /> : <VoiceTab />}
        </main>

        <OverlayStatusbar visible={visible} model={settings?.model} />
      </div>
    </div>
  );
}
