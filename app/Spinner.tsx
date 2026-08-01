/** Diameters, matched to the text scale of whatever the spinner replaces. */
const SIZE = {
  xs: 'h-3.5 w-3.5 border',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-2',
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
  label = 'Loading',
  className = '',
}: {
  size?: keyof typeof SIZE;
  /** Announced to screen readers; name the thing when it's not obvious. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block shrink-0 animate-spin rounded-full border-neutral-300 border-t-cyan-600 dark:border-neutral-700 dark:border-t-cyan-400 ${SIZE[size]} ${className}`}
    />
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
