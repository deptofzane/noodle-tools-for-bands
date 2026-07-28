'use client';

import { useState, type ReactNode } from 'react';

/**
 * A titled section that collapses to just its header (a chevron + title).
 * Used for the event Details/Notes on the view, edit, and new-event screens.
 * Starts open; collapse state is local (resets per mount). When collapsed the
 * body unmounts, so any form value inside must be held by the parent.
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start text-left text-sm font-medium"
      >
        <span
          aria-hidden="true"
          className="text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          {open ? '▾' : '▸'}
        </span>
        {title}
      </button>
      {open && children}
    </div>
  );
}
