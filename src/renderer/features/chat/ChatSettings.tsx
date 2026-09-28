/**
 * =============================================================================
 * ChatSettings — minimal BYOK provider settings inside the chat tab
 * =============================================================================
 *
 * Owns the three `BarelySettings` fields chat needs (apiKey / baseUrl / model)
 * and persists them through the existing `settings:set` invoke. Kept inside
 * `features/chat/` (rather than a global settings tab) so it cannot collide
 * with other agents' UI.
 *
 * POPUP CONTAINMENT RULE: plain inputs only — no `<select>`, no `title=`,
 * autocomplete/spellcheck disabled so Chromium never spawns a native popup
 * that would leak into screen captures.
 * =============================================================================
 */
import { useState, type FormEvent } from "react";
import { DEFAULT_SETTINGS, type BarelySettings } from "../../../shared/ipc-contract";

interface ChatSettingsProps {
  /** Current persisted settings. */
  settings: BarelySettings;
  /** Called with the fresh settings after a successful save. */
  onSaved: (next: BarelySettings) => void;
  /** Close the panel (X button). */
  onClose: () => void;
}

/** The overlay only accepts keyboard focus while one of our fields is used. */
const onFocus = (): void => {
  void window.barely.overlay.setFocusable(true);
};
const onBlur = (): void => {
  void window.barely.overlay.setFocusable(false);
};

export default function ChatSettings({
  settings,
  onSaved,
  onClose,
}: ChatSettingsProps): JSX.Element {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const next = await window.barely.settings.set({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || DEFAULT_SETTINGS.baseUrl,
        model: model.trim() || DEFAULT_SETTINGS.model,
      });
      onSaved(next);
      setStatus("Saved");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleClearKey = (): void => {
    setApiKey("");
    setStatus("Key cleared — press Save");
  };

  return (
    <form className="settings" onSubmit={(event) => void handleSave(event)} noValidate>
      <div className="settings__head">
        <span className="settings__title">AI provider</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close settings"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="field">
        <label htmlFor="barely-field-key">API key</label>
        <input
          id="barely-field-key"
          type="password"
          value={apiKey}
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setApiKey(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>

      <div className="field">
        <label htmlFor="barely-field-base">Base URL</label>
        <input
          id="barely-field-base"
          type="text"
          value={baseUrl}
          placeholder={DEFAULT_SETTINGS.baseUrl}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setBaseUrl(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>

      <div className="field">
        <label htmlFor="barely-field-model">Model</label>
        <input
          id="barely-field-model"
          type="text"
          value={model}
          placeholder={DEFAULT_SETTINGS.model}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setModel(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>

      <p className="settings__note">
        Any OpenAI-compatible endpoint works — the base URL usually ends in{" "}
        <code>/v1</code>.
      </p>

      <div className="settings__actions">
        <span className="settings__status" aria-live="polite">
          {status ?? ""}
        </span>
        <button type="button" className="btn btn--ghost" onClick={handleClearKey}>
          Clear key
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
