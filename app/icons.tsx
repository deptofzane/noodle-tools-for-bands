/**
 * General UI glyphs.
 *
 * Transport controls live in `app/player/icons.tsx` — these are the ordinary
 * actions (view, edit, share) that appear in menus. Same 24×24 grid and 2px
 * stroke as the player set, inheriting `currentColor`, so a row mixing the two
 * reads as one family.
 */

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Open it. */
export function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...strokeProps}
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Change it. */
export function PencilIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...strokeProps}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/**
 * Chain links, not a share arrow: the action copies a URL to the clipboard
 * rather than opening a system share sheet, and the glyph should say which.
 */
export function LinkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...strokeProps}
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/**
 * A list with a plus: append to the queue.
 *
 * Deliberately not a play glyph of any kind — this one *adds* to whatever is
 * playing rather than replacing it, and that's the whole difference between it
 * and the two beside it.
 */
export function AddToQueueIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...strokeProps}
      aria-hidden="true"
    >
      <path d="M11 12H3" />
      <path d="M16 6H3" />
      <path d="M11 18H3" />
      <path d="M18 9v6" />
      <path d="M21 12h-6" />
    </svg>
  );
}
