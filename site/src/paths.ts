/** Absolute link to the GitHub repo (the only "backend" Barely has). */
export const REPO = "https://github.com/bibhuti/barely";

/** The real app icon shipped in `site/public/icon.svg`. */
export const iconUrl = `${import.meta.env.BASE_URL}icon.svg`;

/** Release downloads, falling back to the repo page when no release exists. */
export const DOWNLOAD = "https://github.com/bibhuti/barely/releases";

/**
 * Resolve a repo-root screenshot for the site build.
 * `base: './'` makes BASE_URL `./` in prod (works under any GitHub Pages
 * subpath) and `/` in dev. The vite plugin mirrors `../screenshots` into
 * `dist/screenshots`; a missing file just 404s and `<Shot>` renders its
 * gradient fallback instead.
 */
export function shot(name: string): string {
  return `${import.meta.env.BASE_URL}screenshots/${name}`;
}
