/** Diameters, matched to the text scale of whatever the spinner replaces. */
const SIZE = {
  xs: 'h-3.5 w-3.5 border',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-2',
} as const;

/** Ring colours. The head is the quarter that reads as motion. */
const TONE = {
  /** The app's spinner: neutral track, cyan head. Right on page backgrounds. */
  brand: 'border-line-strong border-t-cyan-600 dark:border-t-cyan-400',
  /**
   * White ring for spinners inside a filled control — `btn-primary` is white
   * on blue, where the brand cyan has almost nothing to contrast against.
   *
   * Deliberately not `currentColor`: the track needs to be a faded version of
   * the head, and Tailwind can't build an opacity modifier on `currentColor`
   * (`border-current/25` compiles to nothing, which leaves the CSS default of
   * a fully opaque `currentColor` on all four sides — a solid ring with no
   * visible head, so it reads as static rather than spinning).
   */
  onFilled: 'border-white/30 border-t-white',
} as const;

/**
 * The app's loading indicator: a ring with one colored quarter, spinning.
 * Same look as the nav's in-flight action spinner, so "something is working"
 * reads the same everywhere.
 *
 * It carries its own `role="status"` label, which is what a screen reader gets
 * in place of the "Loading…" text these replace — so callers don't need to
 * leave visually-hidden text behind.
 */
export function Spinner({
  size = 'md',
  tone = 'brand',
  label = 'Loading',
  className = '',
}: {
  size?: keyof typeof SIZE;
  /** Ring colour. Use `current` inside filled buttons — see `TONE`. */
  tone?: keyof typeof TONE;
  /** Announced to screen readers; name the thing when it's not obvious. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block shrink-0 animate-spin rounded-full ${TONE[tone]} ${SIZE[size]} ${className}`}
    />
  );
}

/**
 * An indeterminate progress bar: a short fill sweeping a thin track.
 *
 * Deliberately indeterminate — the audio engine reports *readiness*, not bytes
 * transferred, so there's no honest percentage to show. It reads as a loading
 * bar rather than a spinner while claiming no more than the spinner did, and
 * it sits in a fraction of the vertical space, which suits a player card.
 *
 * `role="progressbar"` with no `aria-valuenow` is the ARIA form for "busy,
 * amount unknown".
 */
export function LoadingBar({
  label = 'Loading',
  className = '',
}: {
  /** Announced to screen readers; name the thing when it's not obvious. */
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      className={`h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-900 ${className}`}
    >
      <div className="loading-bar-fill h-full w-2/5 rounded-full bg-cyan-600 dark:bg-cyan-400" />
    </div>
  );
}

/**
 * A `Spinner` centered in its own row — the standard "this panel hasn't loaded
 * yet" placeholder, in place of a line of muted text.
 */
export function LoadingBlock({
  size = 'md',
  label,
  className = 'py-8',
}: {
  size?: keyof typeof SIZE;
  label?: string;
  /** Vertical room to hold while loading; override for tight spots. */
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Spinner size={size} label={label} />
    </div>
  );
}
