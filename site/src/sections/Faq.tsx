import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { Reveal } from "../components/Reveal";

interface Item {
  q: string;
  a: string;
}

const ITEMS: Item[] = [
  {
    q: "Does my data go to Barely?",
    a: "There is no Barely server to send it to. Your message goes from the app on your machine directly to the provider you configured: OpenAI, Anthropic, your local Ollama, wherever.",
  },
  {
    q: "Which models can I use?",
    a: "Default is gpt-4o-mini, and the presets cover Claude, Gemini, Grok, Llama, DeepSeek, Groq, Mistral, Together, OpenRouter, or go fully local with Ollama, LM Studio or llama.cpp. Any OpenAI-compatible base URL works as a custom preset.",
  },
  {
    q: "Does it work offline?",
    a: "Yes, pair it with Ollama (or LM Studio) for chat and the system text-to-speech for read-aloud. No network, no key, no account.",
  },
  {
    q: "Will it show up in my screen share?",
    a: "Not by default. The window is content-protected, so macOS and Windows exclude it from captures. You can toggle that live from the header; flip it off and the badge flashes amber “visible in recordings” so you always know.",
  },
  {
    q: "How do I hide it fast?",
    a: "⌘⇧H is panic hide: it disappears and blurs instantly. ⌘⇧B reveals it again, and ⌘⇧M hides the dock icon if you want the app gone from view too.",
  },
  {
    q: "Is my API key safe?",
    a: "It is encrypted at rest with Electron safeStorage, the OS keychain (macOS) or DPAPI (Windows), and written to your local settings file. It is never sent anywhere except to the provider you chose.",
  },
  {
    q: "What does it cost?",
    a: "Free, MIT licensed, bring-your-own-key. You pay your provider for usage, or nothing at all if you run a local model.",
  },
  {
    q: "Does it record my meeting?",
    a: "No. Barely never captures system or meeting audio. The microphone is push-to-talk only: it records while you hold Space, and stops when you let go.",
  },
  {
    q: "Which platforms are supported?",
    a: "macOS is the deepest integration (dock hiding, content protection, keychain); Windows is supported with WDA_EXCLUDEFROMCAPTURE and DPAPI. Linux is on the roadmap.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="section section--tint" id="faq">
      <div className="container container--narrow">
        <Reveal>
          <p className="section-kicker">FAQ</p>
          <h2 className="section-title">Questions, answered briefly.</h2>
        </Reveal>

        <div className="faq">
          {ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={Math.min(i, 4) * 0.04} y={12} amount={0.15}>
                <div className={`faq-item ${isOpen ? "faq-item--open" : ""}`}>
                  <h3>
                    <button
                      type="button"
                      className="faq-q"
                      aria-expanded={isOpen}
                      aria-controls={`faq-a-${i}`}
                      id={`faq-q-${i}`}
                      onClick={() => setOpen(isOpen ? null : i)}
                    >
                      <span>{item.q}</span>
                      <span className="faq-icon" aria-hidden="true">
                        {isOpen ? <Minus size={17} /> : <Plus size={17} />}
                      </span>
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.div
                        className="faq-a-wrap"
                        id={`faq-a-${i}`}
                        role="region"
                        aria-labelledby={`faq-q-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p className="faq-a">{item.a}</p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
