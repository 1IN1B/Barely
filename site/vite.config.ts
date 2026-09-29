import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
/** Repo-root screenshots (may not exist yet — handled gracefully everywhere). */
const shotsSrc = path.join(repoRoot, "screenshots");
const shotsOut = path.resolve(here, "dist/screenshots");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

/**
 * Serve + copy the repo-root `screenshots/` folder into the site build so the
 * page's `screenshots/*.png|jpg` references resolve both in dev and on GitHub
 * Pages (which only ships `site/dist`). Missing files simply 404 → the `<Shot>`
 * component falls back to a gradient placeholder.
 */
function screenshots(): Plugin {
  return {
    name: "barely:repo-screenshots",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!url.startsWith("/screenshots/")) return next();
        const rel = decodeURIComponent(url.slice("/screenshots/".length));
        const file = path.resolve(shotsSrc, rel);
        if (!file.startsWith(shotsSrc + path.sep) || !fs.existsSync(file)) return next();
        const stat = fs.statSync(file);
        if (!stat.isFile()) return next();
        res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
        res.setHeader("Content-Length", stat.size);
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (!fs.existsSync(shotsSrc)) return;
      fs.mkdirSync(shotsOut, { recursive: true });
      fs.cpSync(shotsSrc, shotsOut, { recursive: true });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), screenshots()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 4096,
  },
});
