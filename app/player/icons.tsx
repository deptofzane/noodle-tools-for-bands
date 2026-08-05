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
