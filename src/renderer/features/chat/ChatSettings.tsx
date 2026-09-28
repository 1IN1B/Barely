/**
 * =============================================================================
 * ChatSettings — provider presets + BYOK fields inside the chat tab
 * =============================================================================
 *
 * Owns the four `BarelySettings` fields chat needs (providerId / apiKey /
 * baseUrl / model) and persists them through the existing `settings:set`
 * invoke. Kept inside `features/chat/` (rather than a global settings tab) so
 * it cannot collide with other agents' UI.
 *
 * PROVIDER PRESETS: a tile grid sourced from `src/shared/providers.ts` replaces
 * hand-typed base URLs. Selecting a tile
 *   - auto-fills `baseUrl` (kept verbatim for "Custom"),
 *   - suggests `model` (first id of that preset) and swaps the model field for
 *     a dropdown of that provider's models (MiniSelect — in-window, no popup),
 *   - CLEARS `apiKey` when the user actually switches vendor (a key from one
 *     provider is useless — and misleading — at another), while re-selecting
 *     the current provider keeps the stored key,
 *   - shows ☁️ Cloud / 🖥️ Local, the STT capability and, for local servers,
 *     a reachability badge fed by localDetect.ts ("✓ detected" /
 *     "not reachable") plus the models the running server reports.
 *
 * POPUP CONTAINMENT RULE: plain inputs only — no `<select>`, no `title=`,
 * autocomplete/spellcheck disabled so Chromium never spawns a native popup
 * that would leak into screen captures. The model dropdown is the shared
 * in-window `MiniSelect`. External links (provider "Get key" pages) use
 * `target="_blank"`, which main routes to the SYSTEM browser via
 * `shell.openExternal` (never a child window of the overlay).
 * =============================================================================
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_SETTINGS, type BarelySettings } from "../../../shared/ipc-contract";
import {
  CUSTOM_PROVIDER_ID,
  PROVIDER_PRESETS,
  getProviderPreset,
} from "../../../shared/providers";
import { relockAfterBlur, unlockFocusForControl } from "../../focus";
import { MiniSelect, type MiniSelectOption } from "../voice";
import { probeLocalProvider, type LocalProbe } from "./localDetect";

interface ChatSettingsProps {
  /** Current persisted settings. */
  settings: BarelySettings;
  /** Called with the fresh settings after a successful save. */
  onSaved: (next: BarelySettings) => void;
  /** Close the panel (X button). */
  onClose: () => void;
}

/**
 * Focus handlers for the three text fields.
 *
 * `handleFieldFocus` is the legacy unlock (kept: it re-asserts focusable=true
 * whenever a field does manage to get focus). It can NOT be the FIRST unlock —
 * a `focusable:false` NSWindow never becomes key, so the click never focuses
 * the input and `onFocus` never fires. The first unlock happens on
 * pointer-down instead: see `unlockFocusForControl` on each field below.
 *
 * `handleFieldBlur` is the guarded re-lock: it never drops focusable=false
 * while focus is moving to another control inside this form (Save / Clear key
 * / provider tile / next field).
 */
const handleFieldFocus = (): void => {
  void window.barely.overlay.setFocusable(true).catch(() => undefined);
};

/** `https://api.x.ai/v1/` -> `https://api.x.ai/v1` (so URLs compare cleanly). */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Pick the tile to highlight on open.
 *
 * Settings written before the picker existed default to `openai`, so trust the
 * stored id but reconcile it against the stored URL: a URL that matches some
 * other preset selects that preset, an unknown URL selects "Custom". Result:
 * upgrading users never see a tile that contradicts the base URL below it.
 */
function initialProviderId(settings: BarelySettings): string {
  const stored = getProviderPreset(settings.providerId);
  const url = normalizeUrl(settings.baseUrl);
  if (!stored) return CUSTOM_PROVIDER_ID;
  if (!stored.baseUrl || normalizeUrl(stored.baseUrl) === url) return stored.id;
  const match = PROVIDER_PRESETS.find(
    (preset) => preset.baseUrl && normalizeUrl(preset.baseUrl) === url,
  );
  return match ? match.id : CUSTOM_PROVIDER_ID;
}

export default function ChatSettings({
  settings,
  onSaved,
  onClose,
}: ChatSettingsProps): JSX.Element {
  const [providerId, setProviderId] = useState<string>(() => initialProviderId(settings));
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** `null` = not a local preset / not probed yet ("checking…" while pending). */
  const [probe, setProbe] = useState<LocalProbe | null>(null);
  /** Guards against a slow probe landing after the user switched provider. */
  const probeToken = useRef(0);
  /** Form root — the boundary the guarded blur re-lock checks against. */
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleFieldBlur = useCallback((): void => {
    relockAfterBlur(formRef.current);
  }, []);

  /**
   * FOCUS LOCK (layer 2) — while this panel is open the window stays
   * focusable. Unlocking per-input on focus reintroduces the chicken-and-egg
   * for the very first click; keeping it locked for the panel's lifetime
   * removes the race entirely. Unmount restores the click-through-ish default.
   */
  useEffect(() => {
    void window.barely.overlay.setFocusable(true).catch(() => undefined);
    return () => {
      void window.barely.overlay.setFocusable(false).catch(() => undefined);
    };
  }, []);

  const preset = getProviderPreset(providerId);
  const isLocal = preset?.kind === "local";

  /* -------------------------- local reachability ------------------------- */
  useEffect(() => {
    const target = getProviderPreset(providerId);
    if (!target?.detectUrl) {
      setProbe(null);
      return;
    }
    const token = ++probeToken.current;
    setProbe(null); // "checking…"
    void probeLocalProvider(target).then((result) => {
      if (result && token === probeToken.current) setProbe(result);
    });
  }, [providerId]);

  /* ------------------------------ model field ---------------------------- */
  // Server-reported models win (LM Studio / llama.cpp advertise nothing static);
  // otherwise fall back to the preset's curated list.
  const suggestedModels: string[] = useMemo(() => {
    if (probe && probe.models.length > 0) return probe.models;
    return preset?.models ?? [];
  }, [preset, probe]);

  const modelOptions = useMemo<MiniSelectOption[]>(() => {
    const seen = new Set<string>();
    const out: MiniSelectOption[] = [];
    const add = (value: string): void => {
      const id = value.trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ value: id, label: id });
    };
    add(model); // keep a hand-picked id selectable even if not suggested
    for (const suggestion of suggestedModels) add(suggestion);
    return out;
  }, [model, suggestedModels]);

  // "Custom" (and local servers we couldn't enumerate) stay freeform text.
  const freeTextField = suggestedModels.length === 0;

  /* -------------------------------- actions ------------------------------ */
  const selectProvider = (id: string): void => {
    if (id === providerId) return; // re-click: keep key + fields as-is
    const next = getProviderPreset(id);
    setProviderId(id);
    if (next) {
      if (next.baseUrl) setBaseUrl(next.baseUrl); // Custom never clobbers
      if (next.models.length > 0 && !next.models.includes(model)) {
        setModel(next.models[0]); // first id = default suggestion
      }
      // Switching vendor invalidates the previous vendor's key.
      setApiKey("");
      setStatus(`Selected ${next.label} — press Save`);
    } else {
      setStatus(null);
    }
  };

  const handleSave = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const next = await window.barely.settings.set({
        providerId,
        apiKey: apiKey.trim(),
        baseUrl: normalizeUrl(baseUrl) || DEFAULT_SETTINGS.baseUrl,
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

  /* -------------------------------- render ------------------------------ */
  return (
    <form
      className="settings"
      ref={formRef}
      onSubmit={(event) => void handleSave(event)}
      noValidate
    >
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

      {/* --------------------------- provider tiles ------------------------ */}
      <div className="prov-grid" role="group" aria-label="AI provider presets">
        {PROVIDER_PRESETS.map((option) => {
          const active = option.id === providerId;
          return (
            <button
              key={option.id}
              type="button"
              className={`prov-tile${active ? " prov-tile--on" : ""}`}
              aria-pressed={active}
              onClick={() => selectProvider(option.id)}
            >
              <span className="prov-tile__mono" aria-hidden="true">
                {option.monogram}
              </span>
              <span className="prov-tile__label">{option.label}</span>
            </button>
          );
        })}
      </div>

      {/* ------------------------------ badges ----------------------------- */}
      <div className="prov-meta" aria-live="polite">
        {preset ? (
          <>
            <span className="prov-chip">
              {preset.kind === "local" ? "🖥️ Local" : "☁️ Cloud"}
            </span>
            <span className="prov-chip">OpenAI-compatible</span>
            <span
              className={`prov-chip${preset.stt === false ? " prov-chip--off" : " prov-chip--on"}`}
            >
              {preset.stt === false ? "no STT" : "STT ✓"}
            </span>
            {isLocal ? (
              <span
                className={`prov-chip${
                  probe === null
                    ? " prov-chip--pending"
                    : probe.reachable
                      ? " prov-chip--on"
                      : " prov-chip--off"
                }`}
              >
                {probe === null
                  ? "checking…"
                  : probe.reachable
                    ? "✓ detected"
                    : "not reachable"}
              </span>
            ) : null}
          </>
        ) : (
          <span className="prov-chip">freeform base URL</span>
        )}
      </div>

      {/* ------------------------------ API key ---------------------------- */}
      <div className="field">
        <div className="field__row">
          <label htmlFor="barely-field-key">API key</label>
          {preset?.keyUrl ? (
            <a
              className="field__link"
              href={preset.keyUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Get key ↗
            </a>
          ) : null}
        </div>
        <input
          id="barely-field-key"
          type="password"
          value={apiKey}
          placeholder={preset?.keyHint ?? "sk-…"}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setApiKey(event.target.value)}
          onPointerDown={unlockFocusForControl}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
      </div>

      {/* ------------------------------ base URL --------------------------- */}
      <div className="field">
        <label htmlFor="barely-field-base">Base URL</label>
        <input
          id="barely-field-base"
          type="text"
          value={baseUrl}
          placeholder={preset?.baseUrl || DEFAULT_SETTINGS.baseUrl}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setBaseUrl(event.target.value)}
          onPointerDown={unlockFocusForControl}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
      </div>

      {/* ------------------------------- model ----------------------------- */}
      <div className="field">
        <label htmlFor="barely-field-model">Model</label>
        {freeTextField ? (
          <input
            id="barely-field-model"
            type="text"
            value={model}
            placeholder={preset?.models[0] ?? DEFAULT_SETTINGS.model}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setModel(event.target.value)}
            onPointerDown={unlockFocusForControl}
            onFocus={handleFieldFocus}
            onBlur={handleFieldBlur}
          />
        ) : (
          <MiniSelect
            ariaLabel="Model"
            value={model}
            options={modelOptions}
            placeholder={preset?.models[0] ?? "model"}
            onChange={(value) => setModel(value)}
          />
        )}
      </div>

      <p className="settings__note">
        {preset?.note ??
          "Any OpenAI-compatible endpoint works — the base URL usually ends in /v1."}
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
