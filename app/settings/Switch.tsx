'use client';

/**
 * A switch that can also be half-on.
 *
 * `mixed` is only ever a master's state — some of what it governs is on and
 * some isn't. ARIA has a word for exactly this (`aria-checked="mixed"`), and
 * the knob sits between the two ends so it reads as "not settled" rather than
 * as a third setting.
 *
 * Its own file because two screens draw these now: the grouped preference
 * rows, and the per-offset switches above the Event reminders checkboxes.
 */
export function Switch({
  on,
  mixed = false,
  disabled,
  label,
  title,
  onToggle,
}: {
  on: boolean;
  mixed?: boolean;
  disabled: boolean;
  label: string;
  title?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mixed ? 'mixed' : on}
      title={title}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-40 ' +
        (mixed
          ? 'bg-blue-600/50'
          : on
            ? 'bg-blue-600'
            : 'bg-neutral-300 dark:bg-neutral-700')
      }
    >
      <span
        aria-hidden="true"
        className={
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition ' +
          (mixed ? 'translate-x-2.5' : on ? 'translate-x-5' : 'translate-x-0.5')
        }
      />
    </button>
  );
}
