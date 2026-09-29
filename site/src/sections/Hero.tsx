import { ArrowUpRight, Check, Github, Star } from "lucide-react";
import { Reveal } from "../components/Reveal";
import { Shot } from "../components/Shot";
import OverlayPanel from "../components/OverlayPanel";
import { REPO, shot } from "../paths";

const CHIPS = [
  "MIT open source",
  "Fully local · no backend",
  "13 AI providers",
  "macOS · Windows",
];

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-glow" aria-hidden="true" />
      <div className="container hero-grid">
        <div className="hero-copy">
          <Reveal>
            <span className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Open source · MIT · v0.1
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="hero-title">
              The AI sidekick that&rsquo;s <em>barely</em> there.
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="hero-lede">
              An invisible, always-on-top AI overlay assistant. It floats over your
              apps with AI chat, voice I/O, and screen-share invisibility. Fully
              local: no backend server.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="cta-row">
              <a
                className="btn btn-primary btn-lg"
                href={REPO}
                target="_blank"
                rel="noreferrer noopener"
              >
                Get Barely, free <ArrowUpRight size={16} />
              </a>
              <a
                className="btn btn-ghost btn-lg"
                href={REPO}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Github size={16} /> Star on GitHub
                <span className="btn-star">
                  <Star size={12} /> 1
                </span>
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <ul className="chips">
              {CHIPS.map((c) => (
                <li key={c}>
                  <Check size={13} aria-hidden="true" />
                  {c}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div className="hero-visual">
          <Reveal delay={0.16} y={28} amount={0.1}>
            <div className="hero-stage">
              <Shot
                src={shot("hero-panel.png")}
                alt="The Barely overlay floating above a code editor"
                decorative
                eager
                className="hero-shot"
              />
              <OverlayPanel />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
