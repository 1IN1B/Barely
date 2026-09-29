import { HardDrive, Lock, Shield } from "lucide-react";
import { Reveal } from "../components/Reveal";
import type { LucideIcon } from "lucide-react";

interface Column {
  icon: LucideIcon;
  title: string;
  body: string;
}

const COLUMNS: Column[] = [
  {
    icon: Lock,
    title: "No account",
    body: "Nothing to sign up for. Open the app, pick a provider, start asking.",
  },
  {
    icon: HardDrive,
    title: "No server",
    body: "Your prompt goes from this machine straight to the provider you chose. Barely has no backend to forward it to.",
  },
  {
    icon: Shield,
    title: "No telemetry",
    body: "No analytics, no crash pings, no usage counts. What happens in the panel stays on disk.",
  },
];

export default function Privacy() {
  return (
    <section className="section" id="privacy">
      <div className="container">
        <Reveal>
          <p className="section-kicker">Privacy</p>
          <h2 className="section-title">No account. No server. No telemetry.</h2>
        </Reveal>

        <div className="grid grid-3 privacy-grid">
          {COLUMNS.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.07} y={16}>
              <article className="privacy-col">
                <span className="privacy-icon">
                  <c.icon size={18} />
                </span>
                <h3 className="card-title">{c.title}</h3>
                <p className="card-body">{c.body}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <p className="privacy-note">
            Your API key is encrypted at rest with the OS keychain (
            <code>safeStorage</code>, Keychain on macOS, DPAPI on Windows).
          </p>
        </Reveal>
      </div>
    </section>
  );
}
