/**
 * =============================================================================
 * localDetect.ts — reachability probe for LOCAL provider servers (renderer)
 * =============================================================================
 *
 * Selecting Ollama / LM Studio / llama.cpp fires a best-effort `GET` so the
 * picker can show "✓ detected" or "not reachable" instead of leaving the user
 * guessing why chat later fails with ECONNREFUSED.
 *
 * Two-stage probe (no IPC — the presets ship in the renderer):
 *   1. normal `fetch` → when it works we also get the server's model list
 *      (`/api/tags` for Ollama, `/v1/models` for the OpenAI-style servers).
 *   2. `mode: "no-cors"` retry → a server that is UP but blocks our Origin
 *      (CORS) still resolves as an opaque response; only a refused/reset
 *      connection rejects, which we report as "not reachable".
 *
 * Never throws: callers get a plain `{ reachable, models }` result.
 * =============================================================================
 */

import type { ProviderPreset } from "../../../shared/providers";

/** Result of a local-server probe. */
export interface LocalProbe {
  reachable: boolean;
  /** Model ids discovered on the server (empty when unreadable/CORS-blocked). */
  models: string[];
}

/** Hard cap so a huge model list can't bloat the dropdown. */
const MAX_MODELS = 40;
const PROBE_TIMEOUT_MS = 2500;

/**
 * Probe `preset.detectUrl`; resolves `null` when the preset isn't local
 * (nothing to detect).
 */
export async function probeLocalProvider(preset: ProviderPreset): Promise<LocalProbe | null> {
  const url = preset.detectUrl;
  if (!url) return null;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return { reachable: true, models: [] }; // server answered
    const payload: unknown = await response.json().catch(() => null);
    return { reachable: true, models: parseModels(payload) };
  } catch {
    // Either refused (down) or CORS-blocked (up but unreadable) — disambiguate
    // with an opaque no-cors request, which only fails when nothing listens.
    try {
      await fetch(url, { mode: "no-cors", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      return { reachable: true, models: [] };
    } catch {
      return { reachable: false, models: [] };
    }
  }
}

/**
 * Read model ids out of either response shape:
 *   OpenAI style  `{ data: [{ id }] }`   (LM Studio, llama.cpp, Ollama /v1)
 *   Ollama tags   `{ models: [{ name }] }` (Ollama /api/tags)
 */
function parseModels(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown): void => {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (!id || seen.has(id) || out.length >= MAX_MODELS) return;
    seen.add(id);
    out.push(id);
  };

  const record = payload as { data?: unknown; models?: unknown };
  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      if (item && typeof item === "object") push((item as { id?: unknown }).id);
    }
  }
  if (Array.isArray(record.models)) {
    for (const item of record.models) {
      if (item && typeof item === "object") {
        const entry = item as { name?: unknown; model?: unknown; id?: unknown };
        push(entry.name ?? entry.model ?? entry.id);
      }
    }
  }
  return out;
}
