import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cpu, Eye, EyeOff, Sparkles } from "lucide-react";
import { Mark } from "./Logo";

/** Canned Q/A pairs the demo streams: interview-answer flavour, no API calls. */
const TURNS = [
  {
    q: "Explain binary search like I have 30 seconds.",
    a: "Sort once, then halve the range every step: compare the mid, discard the half that can't hold the key. O(log n): a million sorted rows is about 20 comparisons. Keep the invariant explicit (low inclusive, high exclusive) or the loop never ends.",
  },
  {
    q: "Why is my Node process climbing in RSS?",
    a: "Check retained listeners and unbounded arrays first: a cache keyed by request id never evicts. If the heap is flat while RSS grows it's native memory: look at the driver's pooled buffers before you blame V8.",
  },
  {
    q: "Debounce or throttle a resize handler?",
    a: "Debounce fires once after the noise stops, right for relayout. Throttle fires at a fixed rate, right for scroll-linked work. For resize, debounce plus one immediate call so the first frame isn't blank.",
  },
];

/**
 * HTML/CSS recreation of the floating overlay panel: glass card, streaming
 * typewriter answer, invisibility badge that flips to an amber warning.
 */
export default function OverlayPanel() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [n, setN] = useState(0);
  const [invisible, setInvisible] = useState(true);

  const turn = TURNS[index];
  const full = turn.a;
  const done = n >= full.length;

  useEffect(() => {
    if (done) {
      const hold = window.setTimeout(() => {
        setIndex((i) => (i + 1) % TURNS.length);
        setN(0);
      }, 3400);
      return () => window.clearTimeout(hold);
    }
    const step = reduced ? 0 : 14 + Math.round(Math.random() * 26);
    const t = window.setTimeout(() => setN((v) => v + 1), step);
    return () => window.clearTimeout(t);
  }, [index, n, done, reduced]);

  useEffect(() => {
    const t = window.setTimeout(() => setInvisible((v) => !v), 4200);
    return () => window.clearTimeout(t);
  }, [invisible]);

  return (
    <div className="panel-stage">
      <div className="panel-float">
        <div className="panel-demo">
          <div className="panel-head">
            <span className="panel-brand">
              <Mark size={15} strokeWidth={40} />
              <span className="panel-word">BARELY</span>
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={invisible ? "ok" : "warn"}
                className={`panel-badge panel-badge--${invisible ? "ok" : "warn"}`}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.24 }}
              >
                {invisible ? <EyeOff size={11} /> : <Eye size={11} />}
                {invisible ? "invisible" : "visible in recordings"}
              </motion.span>
            </AnimatePresence>
          </div>

          <div className="panel-thread">
            <div className="panel-q">{turn.q}</div>
            <div className="panel-a">
              <span className="panel-a-mark" aria-hidden="true">
                <Sparkles size={12} />
              </span>
              <p className="panel-a-text">
                {full.slice(0, n)}
                <span className={`caret ${done ? "caret--idle" : ""}`} aria-hidden="true" />
              </p>
            </div>
          </div>

          <div className="panel-input">
            <span className="panel-input-text">Ask anything…</span>
            <span className="panel-input-key">
              <kbd>Space</kbd> hold to talk
            </span>
          </div>

          <div className="panel-status">
            <span>Panic hide</span>
            <span className="dot">·</span>
            <kbd>⌘⇧H</kbd> hide
            <span className="dot">·</span>
            <span className="panel-local">
              <Cpu size={11} /> local
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
