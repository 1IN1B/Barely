/** The Barely mark: an open ring crossed by a diagonal slash. */
export function Mark({
  size = 24,
  className = "",
  strokeWidth = 34,
}: {
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={`mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label="Barely"
    >
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
        <circle cx="256" cy="256" r="168" />
        <line x1="124" y1="436" x2="436" y2="124" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`wordmark ${className}`.trim()}>BARELY</span>;
}

export function Logo({
  size = 22,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`logo ${className}`.trim()}>
      <Mark size={size} />
      <Wordmark />
    </span>
  );
}
