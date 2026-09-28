/**
 * =============================================================================
 * providers.ts — provider preset registry (shared: main + renderer)
 * =============================================================================
 *
 * Ship a curated list of OpenAI-compatible providers so users never have to
 * hand-type a base URL. Selecting a preset fills `settings.baseUrl`, suggests
 * `settings.model` and tells the chat/voice legs what they may assume:
 *
 *   - `openaiCompatible` … chat can POST `{baseUrl}/chat/completions`
 *                          (Anthropic included — see the ANTHROPIC note below).
 *   - `stt`               … voice may POST `{baseUrl}/audio/transcriptions`;
 *                          `false` gates transcription with a FRIENDLY error in
 *                          `stt:status` instead of a raw 404 (see main/voice.ts).
 *   - `kind: 'local'`     … no API key required (Ollama / LM Studio / llama.cpp).
 *   - `detectUrl`         … optional GET the renderer pings on selection to show
 *                          "✓ detected" / "not reachable" for local servers.
 *
 * ANTHROPIC (flagship, verified): Anthropic exposes an official OpenAI SDK
 * compatibility layer — `POST https://api.anthropic.com/v1/chat/completions`
 * with a normal `Authorization: Bearer <claude key>` header and OpenAI-style
 * SSE deltas. Verified live during implementation: the route answers
 * 401 "Invalid Anthropic API Key" (not 404) for a bogus key, so the existing
 * chat.ts transport works unchanged. Hence `openaiCompatible: true` here and
 * the UI note "via Anthropic's OpenAI-compatible layer".
 *
 * This file is deliberately dependency-free (no Electron, no React) so both
 * tsconfig projects (`tsconfig.node.json` + `tsconfig.web.json`) can include
 * it, and it ships no IPC — presets are static data.
 * =============================================================================
 */

/** One selectable provider. */
export interface ProviderPreset {
  /** Stable id persisted as `BarelySettings.providerId`. */
  id: string;
  /** Display label in the picker tiles. */
  label: string;
  /** OpenAI-compatible root, e.g. `https://api.openai.com/v1` (no trailing /). */
  baseUrl: string;
  /** Suggested model ids — the FIRST entry is the default suggestion. */
  models: string[];
  /** Where to mint an API key (opened in the system browser). */
  keyUrl?: string;
  /** Placeholder/hint for the key field, e.g. `sk-…`, `no key needed`. */
  keyHint?: string;
  /** `cloud` needs a key + network; `local` runs on this machine. */
  kind: "cloud" | "local";
  /** Chat works as `POST {baseUrl}/chat/completions` without an adapter. */
  openaiCompatible: boolean;
  /**
   * `false` ⇒ the provider has NO `{baseUrl}/audio/transcriptions` endpoint.
   * Main gates transcription with a friendly `stt:status` error instead of
   * letting a 404 leak into the UI. Defaults to `true` when omitted.
   */
  stt?: boolean;
  /** Renderer-side reachability probe for local servers (`GET` URL). */
  detectUrl?: string;
  /** Short explainer shown under the selected provider tile. */
  note?: string;
  /** 2-character monogram drawn in the picker tile (no logos/brand art). */
  monogram: string;
}

/** Pseudo-preset: the old freeform base URL + model behaviour. */
export const CUSTOM_PROVIDER_ID = "custom";

/**
 * Every selectable provider, in picker order.
 * First entry of `models` is what gets suggested when the tile is selected.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  /* ----------------------------- cloud (chat) ---------------------------- */
  {
    id: "openai",
    label: "OpenAI",
    monogram: "OA",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o4-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…",
    kind: "cloud",
    openaiCompatible: true,
    stt: true,
    note: "Chat + speech-to-text both live on this base URL.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    monogram: "OR",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["gpt-4o-mini", "claude-3.5-sonnet", "gemini-2.0-flash-001", "deepseek/deepseek-chat"],
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-…",
    kind: "cloud",
    openaiCompatible: true,
    stt: false,
    note: "One key routes many vendors — model ids use the `vendor/model` form.",
  },
  {
    id: "groq",
    label: "Groq",
    monogram: "GQ",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b"],
    keyUrl: "https://console.groq.com/keys",
    keyHint: "gsk_…",
    kind: "cloud",
    openaiCompatible: true,
    stt: true,
    note: "Fast + cheap (LPU). Speech-to-text: whisper-large-v3-turbo.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    monogram: "DS",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyHint: "sk-…",
    kind: "cloud",
    openaiCompatible: true,
    stt: false,
    note: "Chat only — no audio endpoint.",
  },
  {
    id: "together",
    label: "Together AI",
    monogram: "TG",
    baseUrl: "https://api.together.xyz/v1",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct"],
    keyUrl: "https://api.together.ai/settings/api-keys",
    keyHint: "your Together key",
    kind: "cloud",
    openaiCompatible: true,
    stt: false,
    note: "Open-weight models on demand — chat only.",
  },
  {
    id: "mistral",
    label: "Mistral",
    monogram: "MI",
    baseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-large-latest", "mistral-small-latest"],
    keyUrl: "https://console.mistral.ai/api-keys",
    keyHint: "your Mistral key",
    kind: "cloud",
    openaiCompatible: true,
    stt: false,
    note: "Chat only — Mistral has no OpenAI-style transcription route.",
  },
  {
    id: "xai",
    label: "xAI Grok",
    monogram: "xA",
    baseUrl: "https://api.x.ai/v1",
    models: ["grok-4.3", "grok-latest", "grok-3", "grok-2-latest"],
    keyUrl: "https://console.x.ai/",
    keyHint: "your xAI key",
    kind: "cloud",
    openaiCompatible: true,
    stt: false,
    note: "Chat only. Older slugs (grok-3 / grok-2-latest) are kept for existing configs.",
  },
  {
    id: "gemini",
    label: "Gemini",
    monogram: "GM",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"],
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza…",
    kind: "cloud",
    openaiCompatible: true,
    stt: false,
    note: "Chat works through Google's OpenAI-compatible endpoint; STT is not exposed there.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    monogram: "AN",
    baseUrl: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-5", "claude-haiku-4-5", "claude-opus-5", "claude-sonnet-4-5"],
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-…",
    kind: "cloud",
    openaiCompatible: true,
    stt: false,
    note: "Via Anthropic's OpenAI-compatible layer (same base URL, Claude key). No audio endpoint.",
  },

  /* --------------------------------- local -------------------------------- */
  {
    id: "ollama",
    label: "Ollama",
    monogram: "OL",
    baseUrl: "http://localhost:11434/v1",
    models: ["llama3.2", "qwen2.5:7b", "mistral", "gemma3"],
    keyHint: "no key needed",
    kind: "local",
    openaiCompatible: true,
    stt: true,
    detectUrl: "http://localhost:11434/api/tags",
    note: "Runs on this machine. Transcription needs an audio-capable model pulled.",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    monogram: "LM",
    baseUrl: "http://localhost:1234/v1",
    models: [],
    keyHint: "no key needed",
    kind: "local",
    openaiCompatible: true,
    stt: false,
    detectUrl: "http://localhost:1234/v1/models",
    note: "Models are listed from your running local server.",
  },
  {
    id: "llamacpp",
    label: "llama.cpp",
    monogram: "LC",
    baseUrl: "http://localhost:8080/v1",
    models: [],
    keyHint: "no key needed",
    kind: "local",
    openaiCompatible: true,
    stt: true,
    detectUrl: "http://localhost:8080/v1/models",
    note: "`llama-server` with `--port 8080`; models come from the server.",
  },

  /* -------------------------------- custom -------------------------------- */
  {
    id: CUSTOM_PROVIDER_ID,
    label: "Custom",
    monogram: "··",
    // Never overwrites the user's URL — the preset keeps whatever is stored.
    baseUrl: "",
    models: [],
    keyHint: "sk-…",
    kind: "cloud",
    openaiCompatible: true,
    stt: true,
    note: "Freeform: any OpenAI-compatible base URL (usually ends in `/v1`).",
  },
];

/** Look up a preset by id; `null` for unknown/legacy ids. */
export function getProviderPreset(id: string | undefined | null): ProviderPreset | null {
  if (!id) return null;
  return PROVIDER_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Whether transcription is allowed for this provider (`true` when unknown). */
export function providerSupportsStt(id: string | undefined | null): boolean {
  const preset = getProviderPreset(id);
  return preset ? preset.stt !== false : true;
}

/** Local servers don't need an API key (unknown presets keep the old rule). */
export function providerNeedsKey(id: string | undefined | null): boolean {
  const preset = getProviderPreset(id);
  return preset ? preset.kind !== "local" : true;
}
