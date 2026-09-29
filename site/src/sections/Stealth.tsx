import { Ban, Check, Eye, EyeOff, MonitorX } from "lucide-react";
import { Reveal } from "../components/Reveal";
import { Shot } from "../components/Shot";
import { shot } from "../paths";

const FACTS = [
  "macOS: NSWindowSharingNone · Windows: WDA_EXCLUDEFROMCAPTURE",
  "Re-asserted after every show; AppKit silently resets it otherwise",
];

export default function Stealth() {
  return (
    <section className="section section--tint" id="stealth">
      <div className="container split">
        <div className="split-copy">
          <Reveal>
            <p className="section-kicker">Stealth</p>
            <h2 className="section-title">
              Invisible in screen shares <span className="accent">&amp;</span>{" "}
              recordings.
            </h2>
            <p className="section-lede">
              Barely marks its window as content-protected, so the OS leaves it
              out of screen shares, screenshots and recordings entirely. You see
              the answer; the capture sees your work.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <ul className="ticks">
              {FACTS.map((f) => (
                <li key={f}>
                  <Check size={15} aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.14}>
            <div className="note">
              <span className="note-icon" aria-hidden="true">
                <Ban size={15} />
              </span>
              <div>
                <h3 className="note-title">The popup containment rule</h3>
                <p className="note-body">
                  Content protection covers only the panel itself. Native OS popups,
                  such as context menus, tooltips and <code>&lt;select&gt;</code>{" "}
                  dropdowns, are separate windows and{" "}
                  <strong>will leak into captures</strong>. So Barely bans them:
                  no native menus, no <code>title=</code> tooltips, no native
                  selects. Every affordance lives inside the panel.
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <div className="split-media">
          <Reveal delay={0.1} y={24} amount={0.15}>
            <div className="stealth-pair">
              <Shot
                src={shot("stealth-invisible.jpg")}
                alt="Barely excluded from a screen share, the meeting shows only the document"
                caption="In screen share"
                badge={
                  <>
                    <EyeOff size={12} aria-hidden="true" /> invisible
                  </>
                }
                tone="green"
              />
              <Shot
                src={shot("stealth-warning.jpg")}
                alt="Barely flashing an amber warning that it would be visible in a recording"
                caption="In a recording"
                badge={
                  <>
                    <Eye size={12} aria-hidden="true" /> visible in recordings
                  </>
                }
                tone="amber"
              />
            </div>
            <p className="stealth-foot">
              <MonitorX size={14} aria-hidden="true" /> Toggle it live from the
              header switch; off means off, until you turn it back on.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
