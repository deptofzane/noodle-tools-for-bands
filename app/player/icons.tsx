/**
 * Player glyphs shared across surfaces, so the same control reads the same
 * way wherever it appears. Plain SVG — no client boundary of its own.
 */

/** Circular arrow: start the current track over. Not "previous track". */
export function RestartIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10a9 9 0 1 1 2.64 6.36" />
      <path d="M3 4v6h6" />
    </svg>
  );
}

/** Solid triangle: start playing. */
export function PlayIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

/**
 * Crossing arrows: shuffle.
 *
 * Lives here rather than inline in the player because two surfaces draw it
 * now — the transport control and the setlist menu — and a hand-copied path
 * is how the same control starts looking slightly different in two places.
 */
export function ShuffleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="m15 15 6 6" />
      <path d="m4 4 5 5" />
    </svg>
  );
}
