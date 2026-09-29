import { ArrowUpRight, Github, Zap } from "lucide-react";
import { Reveal } from "../components/Reveal";
import { DOWNLOAD, REPO, iconUrl } from "../paths";

export default function FinalCta() {
  return (
    <section className="section" id="get">
      <div className="container">
        <Reveal y={24}>
          <div className="cta-block">
            <span className="cta-block-glow" aria-hidden="true" />
            <span className="cta-mark">
              <img src={iconUrl} alt="Barely app icon" width={84} height={84} />
            </span>
            <h2 className="cta-title">
              Barely there. <span className="accent">Exactly as intended.</span>
            </h2>
            <p className="cta-sub">
              Free, open source, and running on your machine in about a minute.
            </p>
            <div className="cta-row cta-row--center">
              <a
                className="btn btn-primary btn-lg"
                href={DOWNLOAD}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Zap size={16} /> Download Barely
              </a>
              <a
                className="btn btn-ghost btn-lg"
                href={REPO}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Github size={16} /> View source
                <ArrowUpRight size={15} />
              </a>
            </div>
            <p className="cta-fineprint">
              Use it in line with your school&rsquo;s or employer&rsquo;s
              policies.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
