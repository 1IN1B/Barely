const PROVIDERS = [
  "OpenAI",
  "Claude",
  "Gemini",
  "Groq",
  "DeepSeek",
  "Ollama",
  "LM Studio",
  "Mistral",
  "xAI Grok",
  "Together AI",
  "OpenRouter",
  "llama.cpp",
];

function Group({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div className="marquee-group" aria-hidden={duplicate || undefined}>
      {PROVIDERS.map((p) => (
        <span className="marquee-item" key={p}>
          <span className="marquee-dot" aria-hidden="true" />
          {p}
        </span>
      ))}
    </div>
  );
}

/** Infinite provider strip: cloud and local, bring your own key. */
export default function Providers() {
  return (
    <section className="strip" aria-label="Supported AI providers">
      <p className="strip-label">Pick any of 13 providers, cloud or fully local</p>
      <div className="marquee">
        <div className="marquee-track">
          <Group />
          <Group duplicate />
        </div>
      </div>
    </section>
  );
}
