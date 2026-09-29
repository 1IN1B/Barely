import { Quote, Sparkles } from "lucide-react";
import { Reveal } from "../components/Reveal";

const BEATS = [
  { label: "Before", text: "Alt-tab roulette" },
  { label: "Found", text: "One floating panel" },
  { label: "Flow", text: "Ask → read → answer" },
  { label: "After", text: "Clean recording, offer" },
];

export default function Story() {
  return (
    <section className="section section--tint" id="story">
      <div className="container">
        <Reveal>
          <p className="section-kicker">
            <Sparkles size={13} aria-hidden="true" /> A typical Barely user story
          </p>
        </Reveal>

        <Reveal delay={0.08} y={24}>
          <figure className="story">
            <span className="story-quote" aria-hidden="true">
              <Quote size={26} />
            </span>

            <blockquote className="story-text">
              Ananya, a final-year CS student, had three interviews in one week.
              In the first she tabbed to a chat window to check a complexity
              answer, and watched the interviewer&rsquo;s eyes follow the share.
              She spent the rest of the call explaining herself. Then she
              installed Barely. The panel floated above her editor, excluded from
              the capture, and she asked it to walk her through a deadlock
              example while she typed the fix in her own window. No alt-tab, no
              browser history, no second monitor propped against the wall. By
              round three she was reading between questions, answering in her own
              words, and shipping a clean recording. She got the offer.
            </blockquote>

            <figcaption className="story-by">
              <span className="story-avatar" aria-hidden="true">
                A
              </span>
              <span>
                <strong>Ananya S.</strong>, final-year CS student
                <em>Composite story · illustrative, not a quoted customer</em>
              </span>
            </figcaption>
          </figure>
        </Reveal>

        <Reveal delay={0.14}>
          <ol className="beats">
            {BEATS.map((b) => (
              <li key={b.label}>
                <span className="beats-label">{b.label}</span>
                <span className="beats-text">{b.text}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
