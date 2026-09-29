import {
  GraduationCap,
  Layers,
  Monitor,
  Presentation,
  Terminal,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "../components/Reveal";

interface Case {
  icon: LucideIcon;
  title: string;
  body: string;
}

const CASES: Case[] = [
  {
    icon: GraduationCap,
    title: "Students in placement & technical rounds",
    body: "Keep the editor and the hint in the same field of view. No second laptop, no phone propped against the keyboard.",
  },
  {
    icon: Video,
    title: "Job seekers in live video interviews",
    body: "The panel sits above the call and stays out of the share. Read a prompt, answer in your own words, move on.",
  },
  {
    icon: Monitor,
    title: "Professionals in screen-shared meetings",
    body: "Pull up a spec, a metric or a name mid-demo while the recording only ever captures your work.",
  },
  {
    icon: Terminal,
    title: "Developers on pairing & debugging calls",
    body: "Paste a stack trace, get a hypothesis, try it live, without a browser tab sliding into the share.",
  },
  {
    icon: Presentation,
    title: "Presenters & live demos",
    body: "Speaker notes that live outside the slide deck and outside the capture. Panic-hide if someone leans over.",
  },
  {
    icon: Layers,
    title: "Anyone who needs a private second screen",
    body: "A compact always-on-top surface for the thing you want to look at without opening another window.",
  },
];

export default function UseCases() {
  return (
    <section className="section" id="use-cases">
      <div className="container">
        <Reveal>
          <p className="section-kicker">Use cases</p>
          <h2 className="section-title">
            Built for the moments you can&rsquo;t be seen looking for help.
          </h2>
        </Reveal>

        <div className="grid grid-3 cases-grid">
          {CASES.map((c, i) => (
            <Reveal key={c.title} delay={(i % 3) * 0.07} y={16}>
              <article className="card card--case">
                <span className="card-icon card-icon--accent">
                  <c.icon size={18} />
                </span>
                <h3 className="card-title">{c.title}</h3>
                <p className="card-body">{c.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
