import {
  Command,
  EyeOff,
  KeyRound,
  Lock,
  MessageSquare,
  Mic,
  Pin,
  ShieldAlert,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "../components/Reveal";

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: EyeOff,
    title: "Invisible in screen shares",
    body: "Native contentProtection: NSWindowSharingNone on macOS, WDA_EXCLUDEFROMCAPTURE on Windows. Your capture never sees the panel.",
  },
  {
    icon: Pin,
    title: "Always-on-top HUD",
    body: "A frameless 460×420 window pinned above every workspace and full-screen app, click-through until you need it.",
  },
  {
    icon: MessageSquare,
    title: "Streaming AI chat",
    body: "Tokens arrive live, rendered as markdown with syntax-highlighted code blocks you can actually read.",
  },
  {
    icon: Mic,
    title: "Push-to-talk voice",
    body: "Hold Space, speak, release. Transcription runs on demand; nothing listens in the background.",
  },
  {
    icon: Volume2,
    title: "Read it back, offline",
    body: "System text-to-speech reads the answer aloud while you keep typing. No cloud TTS round trip.",
  },
  {
    icon: ShieldAlert,
    title: "Panic hide · ⌘⇧H",
    body: "One chord hides and blurs everything instantly. ⌘⇧B brings it back exactly where it was.",
  },
  {
    icon: KeyRound,
    title: "Bring your own key",
    body: "13 presets: OpenAI, Claude, Gemini, Grok, DeepSeek, Groq, Mistral… plus Ollama, LM Studio and llama.cpp, keyless.",
  },
  {
    icon: Lock,
    title: "Nothing leaves your machine",
    body: "API keys encrypted with the OS keychain, settings on local disk. No account, no Barely server, no telemetry.",
  },
  {
    icon: Command,
    title: "Global hotkeys + tray",
    body: "Summon, hide and flip invisibility from anywhere. The app stays resident in the tray; close the panel, not the app.",
  },
];

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <Reveal>
          <p className="section-kicker">Features</p>
          <h2 className="section-title">Everything you need. Nothing you can see.</h2>
          <p className="section-lede">
            Nine moving parts, one panel. Each one exists because a real call
            needed it.
          </p>
        </Reveal>

        <div className="grid grid-3 features-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.07} y={16}>
              <article className="card">
                <span className="card-icon">
                  <f.icon size={18} />
                </span>
                <h3 className="card-title">{f.title}</h3>
                <p className="card-body">{f.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
