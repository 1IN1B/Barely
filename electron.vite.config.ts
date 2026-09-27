import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * electron-vite config.
 *  - main/preload: bundled by Vite (deps externalized -> require() at runtime)
 *  - renderer: React SPA served in dev / bundled to out/renderer
 *
 * Aliases:
 *   @        -> src/renderer/src   (UI code)
 *   @shared  -> src/shared         (IPC contract — import types from here)
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
});
