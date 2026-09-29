import { motion } from "framer-motion";
import { Check, Download, KeyRound, Mic, ScreenShare, ShieldAlert } from "lucide-react";
import { Reveal } from "../components/Reveal";
import type { LucideIcon } from "lucide-react";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: Download,
    title: "Install & launch",
    body: "Download, open it once. The panel appears top-centre, invisible by default.",
  },
  {
    icon: KeyRound,
    title: "Connect your AI",
    body: "Pick one of 13 providers and paste a key (it stays on your machine), or go keyless with Ollama.",
  },
  {
    icon: Mic,
    title: "Ask or dictate",
    body: "Type “Ask anything…” or hold Space to talk. The answer streams above everything.",
  },
  {
    icon: ScreenShare,
    title: "Share your screen",
    body: "The panel is excluded from captures, so the meeting only ever sees your work.",
  },
  {
    icon: ShieldAlert,
    title: "Panic hide ⌘⇧H",
    body: "Hides and blurs instantly. ⌘⇧B reveals it, right where you left it.",
  },
  {
    icon: Check,
    title: "Read, act, done",
    body: "No tab to close, no history to clear. The app stays resident in your tray.",
  },
];

export default function HowItWorks() {
  return (
    <section className="section" id="how-it-works">
      <div className="container">
        <Reveal>
          <p className="section-kicker">How it works</p>
          <h2 className="section-title">Six steps. Then muscle memory.</h2>
        </Reveal>

        <div className="flow">
          <motion.span
            className="flow-line flow-line--h"
            aria-hidden="true"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />
          <motion.span
            className="flow-line flow-line--v"
            aria-hidden="true"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />

          <ol className="flow-steps">
            {STEPS.map((s, i) => (
              <li className="flow-item" key={s.title}>
                <Reveal delay={i * 0.08} y={16} amount={0.3}>
                  <span className="flow-num">{i + 1}</span>
                  <span className="flow-icon" aria-hidden="true">
                    <s.icon size={15} />
                  </span>
                  <h3 className="flow-title">{s.title}</h3>
                  <p className="flow-body">{s.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
