import { Github } from "lucide-react";
import { Wordmark, Mark } from "../components/Logo";
import { REPO } from "../paths";

const LINKS = [
  { label: "GitHub", href: REPO },
  { label: "README", href: `${REPO}#readme` },
  { label: "MIT License", href: `${REPO}/blob/main/package.json` },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Mark size={18} />
          <Wordmark />
        </div>

        <nav className="footer-links" aria-label="Footer">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer noopener">
              {l.label}
            </a>
          ))}
        </nav>

        <p className="footer-note">
          Not affiliated with Zoom, Google, Microsoft or any other platform you
          might use it in front of.
        </p>

        <p className="footer-copy">
          <a
            className="footer-gh"
            href={REPO}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Barely on GitHub"
          >
            <Github size={15} />
          </a>
          © 2026 Barely · MIT licensed
        </p>
      </div>
    </footer>
  );
}
