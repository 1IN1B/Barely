import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Github, Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { REPO } from "../paths";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className={`nav ${scrolled || open ? "nav--stuck" : ""}`}>
      <div className="container nav-inner">
        <a className="nav-brand" href="#top" onClick={() => setOpen(false)}>
          <Logo size={20} />
        </a>

        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <a
            className="nav-icon-link"
            href={REPO}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Barely on GitHub"
          >
            <Github size={17} />
          </a>
          <a
            className="btn btn-primary btn-sm nav-cta"
            href={REPO}
            target="_blank"
            rel="noreferrer noopener"
          >
            Get Barely <ArrowUpRight size={14} />
          </a>
          <button
            type="button"
            className="nav-burger"
            aria-expanded={open}
            aria-controls="nav-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="nav-menu"
            className="nav-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="container nav-panel-inner">
              {LINKS.map((l, i) => (
                <motion.a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 + i * 0.05, duration: 0.3 }}
                >
                  {l.label}
                </motion.a>
              ))}
              <a
                className="btn btn-primary nav-panel-cta"
                href={REPO}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => setOpen(false)}
              >
                Get Barely <ArrowUpRight size={15} />
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
