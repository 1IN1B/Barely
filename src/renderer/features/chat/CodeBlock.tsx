/**
 * =============================================================================
 * CodeBlock — a fenced code block with OPTIONAL syntax highlighting
 * =============================================================================
 *
 * Highlighting is deliberately deferred: while the assistant message is still
 * streaming, tokens arrive one chunk at a time and re-highlighting on every
 * chunk is wasted work (and a visible flicker). So the caller passes
 * `highlight={false}` until the message is done, and we render the raw text.
 * Once `highlight` flips to true, the finished block is highlighted once.
 *
 * `highlight.js/lib/core` + a hand-picked set of languages is used instead of
 * the prebuilt `common` bundle: chat answers are overwhelmingly ts/js/python/
 * shell/json, and the core build keeps the renderer ~350 kB lighter. Adding a
 * language later is one `hljs.registerLanguage(...)` line.
 *
 * SAFETY: `hljs.highlight()` returns HTML-escaped markup (entities for `<`,
 * `>`, `&`, quotes). It is safe to inject with `dangerouslySetInnerHTML`; raw
 * model text is never passed through unescaped.
 * =============================================================================
 */
import { memo, useMemo } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("go", go);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
// The TypeScript grammar is a superset of JavaScript — reusing it keeps a
// second (largely duplicate) grammar out of the bundle.
hljs.registerLanguage("javascript", typescript);
hljs.registerAliases(["js", "jsx", "mjs", "cjs"], { languageName: "javascript" });
// Models often write ```shell / ```console; hljs only knows bash/sh.
hljs.registerAliases(["shell", "console", "zsh"], { languageName: "bash" });
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

interface CodeBlockProps {
  /** Raw fence body (the lines between ``` fences). */
  code: string;
  /** Fence info string, e.g. `ts`, `python`, or "" when the model omitted it. */
  language: string;
  /** Highlight now? False while the message is still streaming. */
  highlight: boolean;
}

function CodeBlock({ code, language, highlight }: CodeBlockProps): JSX.Element {
  const html = useMemo(() => {
    if (!highlight) return null;
    const lang = language.trim().toLowerCase();
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code).value;
  }, [code, language, highlight]);

  if (html === null) {
    return (
      <pre className="md-pre">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <pre className="md-pre">
      <code
        className="hljs"
        // hljs-escaped output — see SAFETY note above.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}

export default memo(CodeBlock);
