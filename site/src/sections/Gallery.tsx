import { Reveal } from "../components/Reveal";
import { Shot } from "../components/Shot";
import { shot } from "../paths";

const SHOTS = [
  {
    file: "chat.jpg",
    title: "Chat",
    caption: "Streaming answer · markdown + code",
  },
  {
    file: "voice.jpg",
    title: "Voice",
    caption: "Hold Space to talk",
  },
  {
    file: "providers.jpg",
    title: "Providers",
    caption: "13 presets · cloud or local",
  },
  {
    file: "stealth-invisible.jpg",
    title: "Stealth",
    caption: "Excluded from the capture",
  },
];

export default function Gallery() {
  return (
    <section className="section section--tint" id="gallery">
      <div className="container">
        <Reveal>
          <p className="section-kicker">Screenshots</p>
          <h2 className="section-title">The whole panel is this small.</h2>
        </Reveal>

        <div className="grid grid-2 gallery-grid">
          {SHOTS.map((s, i) => (
            <Reveal key={s.file} delay={(i % 2) * 0.08} y={18} amount={0.15}>
              <Shot
                src={shot(s.file)}
                alt={`Barely screenshot: ${s.title}`}
                caption={s.caption}
                tone="accent"
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
