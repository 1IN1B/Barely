import { useEffect, useState } from "react";
import OverlayHeader from "../components/OverlayHeader";
import OverlayTabs, { type TabId } from "../components/OverlayTabs";
import OverlayStatusbar from "../components/OverlayStatusbar";
import ChatTab from "../features/chat/ChatTab";
import { queueTranscript } from "../features/chat/transcriptQueue";
import VoiceTab from "../features/voice/VoiceTab";
import { VOICE_TRANSCRIPT_EVENT, type VoiceTranscriptDetail } from "../features/voice";
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

  // Wire up main -> renderer events + load settings once on mount.
  useEffect(() => {
    let cancelled = false;
    window.barely.settings
      .get()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((err) => console.error("[barely] failed to load settings:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------------- voice -> chat hand-off ------------------------- */
  // VoiceTab publishes `barely:voice-transcript`; the Chat tab is usually
  // unmounted while the Voice tab is open, so App (always mounted) queues the
  // text and flips to the Chat tab, whose composer drains the queue.
  useEffect(() => {
    const handleTranscript = (event: Event): void => {
      const detail = (event as CustomEvent<VoiceTranscriptDetail>).detail;
      const text = detail?.text?.trim();
      if (!text) return;
      queueTranscript(text);
      setTab("chat");
    };
    window.addEventListener(VOICE_TRANSCRIPT_EVENT, handleTranscript);
    return () => window.removeEventListener(VOICE_TRANSCRIPT_EVENT, handleTranscript);
  }, []);

  /* ------------------------ stealth: activity + panic -------------------- */
  useEffect(() => {
    // Activity ping: keeps the OPTIONAL auto-fade alive (`settings.
    // autoHideSeconds`, default 0 = disabled). Throttled so mousemove spam
    // never turns into IPC spam.
    let lastPingAt = 0;
    const ping = (): void => {
      const now = Date.now();
      if (now - lastPingAt < 750) return;
      lastPingAt = now;
      void window.barely.overlay.userActivity().catch(() => undefined);
    };
    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
    ];
    for (const name of activityEvents) {
      window.addEventListener(name, ping, { passive: true });
    }

    // Panic fired (hotkey / tray / IPC): the overlay is already hidden by
    // main — drop keyboard focus and clear the focused input right away so
    // nothing is left selected when it reappears.
    const unsubscribePanic = window.barely.stealth.onPanic(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      void window.barely.overlay.setFocusable(false);
    });

    return () => {
      for (const name of activityEvents) window.removeEventListener(name, ping);
      unsubscribePanic();
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

        <OverlayStatusbar model={settings?.model} />
      </div>
    </div>
  );
}
