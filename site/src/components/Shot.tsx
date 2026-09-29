import { useState, type ReactNode } from "react";
import { Mark } from "./Logo";

export type ShotTone = "green" | "amber" | "accent";

/**
 * Screenshot with a graceful fallback: if the file 404s (screenshots are
 * captured later than this page), we swap in a styled gradient placeholder
 * carrying the caption instead of a broken image icon.
 */
export function Shot({
  src,
  alt,
  caption,
  badge,
  tone = "accent",
  className = "",
  decorative = false,
  eager = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  badge?: ReactNode;
  tone?: ShotTone;
  className?: string;
  /** Decorative backdrops fall back to a bare gradient with no caption text. */
  decorative?: boolean;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  const media = failed ? (
    <div
      className={`shot-fallback shot-fallback--${decorative ? "plain" : tone}`}
      role="img"
      aria-label={alt}
    >
      <Mark size={decorative ? 120 : 44} className="shot-fallback-mark" strokeWidth={26} />
      {!decorative && <span className="shot-fallback-text">{caption ?? alt}</span>}
    </div>
  ) : (
    <img
      className="shot-img"
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );

  return (
    <figure className={`shot ${className}`.trim()}>
      <div className="shot-frame">
        {media}
        {badge ? (
          <span className={`shot-badge shot-badge--${tone}`}>{badge}</span>
        ) : null}
        {caption && !decorative ? <span className="shot-chip">{caption}</span> : null}
      </div>
    </figure>
  );
}
