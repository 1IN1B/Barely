/**
 * =============================================================================
 * settings.ts — JSON-file settings store with optional `safeStorage` encryption
 * =============================================================================
 *
 * Storage location: `<app.getPath('userData')>/settings.json`
 *   macOS:   ~/Library/Application Support/Barely/settings.json
 *   Windows: %APPDATA%/Barely/settings.json
 *   Linux:   ~/.config/Barely/settings.json
 *
 * Format (single JSON object):
 *   {
 *     "apiKey": "",              // plaintext fallback (only when safeStorage unavailable)
 *     "apiKeyEnc": "base64...",  // safeStorage-encrypted apiKey (preferred)
 *     "baseUrl": "...", "model": "...", ...   // plain BarelySettings fields
 *   }
 *
 * Encryption policy (MVP):
 *   - If Electron `safeStorage.isEncryptionAvailable()`, the apiKey is stored
 *     ENCRYPTED (OS keychain-backed: Keychain on macOS, DPAPI on Windows,
 *     kwallet/gnome-libsecret on Linux) and never written in plaintext.
 *   - Otherwise it degrades gracefully to plaintext (acceptable for MVP; the
 *     README documents this as a known limitation).
 *
 * Reads are cached in memory; writes are atomic (tmp file + rename).
 * =============================================================================
 */

import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, type BarelySettings } from "../shared/ipc-contract";

/** On-disk shape: BarelySettings fields plus the encrypted-key envelope. */
interface SettingsFile extends Partial<BarelySettings> {
  /** base64(safeStorage.encryptString(apiKey)) — preferred key storage. */
  apiKeyEnc?: string;
}

let cache: BarelySettings | null = null;

/** Absolute path of the settings file. */
export function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

/** Read + merge with defaults (cached after first successful read). */
export function getSettings(): BarelySettings {
  if (cache) return { ...cache };
  cache = readFromDisk();
  return { ...cache };
}

/**
 * Merge a patch into the stored settings and persist.
 * `apiKey: ""` explicitly clears both plaintext and encrypted key material.
 */
export function updateSettings(patch: Partial<BarelySettings>): BarelySettings {
  const current = getSettings();
  const next: BarelySettings = { ...current, ...patch };
  cache = next;
  writeToDisk(next);
  return { ...next };
}

/** Drop the in-memory cache (useful for tests / `settings:reset` later). */
export function resetSettingsCache(): void {
  cache = null;
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

function readFromDisk(): BarelySettings {
  const file = getSettingsPath();
  let raw: SettingsFile = {};
  try {
    if (fs.existsSync(file)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object") raw = parsed as SettingsFile;
    }
  } catch (err) {
    // Corrupt/missing file: fall back to defaults rather than crash.
    console.error("[barely:settings] failed to read settings, using defaults:", err);
    raw = {};
  }

  const { apiKeyEnc, ...plain } = raw;
  const settings: BarelySettings = {
    ...DEFAULT_SETTINGS,
    ...stripUndefined(plain),
    apiKey: decryptKey(apiKeyEnc) ?? (typeof plain.apiKey === "string" ? plain.apiKey : ""),
  };
  return settings;
}

function writeToDisk(settings: BarelySettings): void {
  const file = getSettingsPath();
  const { apiKey, ...rest } = settings;
  const out: SettingsFile = { ...stripUndefined(rest) };

  if (apiKey) {
    const encrypted = encryptKey(apiKey);
    if (encrypted) out.apiKeyEnc = encrypted; // encrypted at rest
    else out.apiKey = apiKey; // graceful plaintext fallback (MVP)
  }

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, file); // atomic on the same volume
  } catch (err) {
    console.error("[barely:settings] failed to persist settings:", err);
  }
}

/** base64-encode encrypted key material; null when safeStorage unavailable. */
function encryptKey(apiKey: string): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.encryptString(apiKey).toString("base64");
  } catch {
    return null;
  }
}

/** Decrypt stored key material; null when missing/undecryptable. */
function decryptKey(apiKeyEnc: string | undefined): string | null {
  if (!apiKeyEnc) return null;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(apiKeyEnc, "base64"));
  } catch (err) {
    // e.g. keychain changed machines — surface as empty rather than crash.
    console.error("[barely:settings] failed to decrypt apiKey:", err);
    return null;
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
