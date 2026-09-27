/**
 * Ambient types for the preload-exposed API.
 *
 * `window.barely` is the ONLY bridge between the overlay UI and the Electron
 * main process — everything is typed from the single source of truth in
 * `src/shared/ipc-contract.ts`.
 */
import type { BarelyApi } from "../../shared/ipc-contract";

declare global {
  interface Window {
    /** Typed API exposed by src/preload/index.ts via contextBridge. */
    barely: BarelyApi;
  }
}

export {};
