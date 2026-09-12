'use client';

import type { ReactNode } from 'react';
import { usePersistedBoolean } from '../usePersistedBoolean';

/**
 * A minimizable section of Home's Activity tab.
 *
 * The header matches Open polls and Recent events beside it — chevron,
 * heading, count — so the tab reads as one set of panels rather than two
 * kinds. Expanded on a first visit; after that, whatever you last left it as,
 * per device.
 */
export function ActivitySection({
  id,
  title,
  count,
  persistKey,
  defaultOpen = true,
  children,
}: {
  /** The heading's id, which also names the section for assistive tech. */
  id: string;
  title: string;
  count: number;
  persistKey: string;
  /**
   * How the section sits before anyone has touched it. Only the default —
   * `usePersistedBoolean` writes on toggle, so a section someone has opened or
   * closed keeps their choice regardless of what this says.
   */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = usePersistedBoolean(persistKey, defaultOpen);

  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 self-start text-left"
      >
        <span
          aria-hidden="true"
          className="minor-text-theme-colors hover:text-fg-body"
        >
          {open ? '▾' : '▸'}
        </span>
        <h2 id={id} className="text-sm font-medium">
          {title}
        </h2>
        <span className="text-xs minor-text-theme-colors">
          <span aria-hidden="true">·</span> {count}
        </span>
      </button>

      {open && children}
    </section>
  );
}
