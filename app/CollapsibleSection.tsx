'use client';

import { useState, type ReactNode } from 'react';
import { usePersistedBoolean } from './usePersistedBoolean';

/**
 * A titled section that collapses to just its header (a chevron + title).
 * Used for the event Details/Notes on the view, edit, and new-event screens.
 * Starts open. When collapsed the body unmounts, so any form value inside must
 * be held by the parent.
 *
 * Pass `persistKey` to remember the open/closed state across navigation and
 * reloads (localStorage). Without it, the state is local and resets per mount.
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  persistKey,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  persistKey?: string;
  children: ReactNode;
}) {
  return persistKey ? (
    <PersistedCollapsible
      title={title}
      defaultOpen={defaultOpen}
      persistKey={persistKey}
    >
      {children}
    </PersistedCollapsible>
  ) : (
    <LocalCollapsible title={title} defaultOpen={defaultOpen}>
      {children}
    </LocalCollapsible>
  );
}

function LocalCollapsible({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <CollapsibleShell
      title={title}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      {children}
    </CollapsibleShell>
  );
}

function PersistedCollapsible({
  title,
  defaultOpen,
  persistKey,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  persistKey: string;
  children: ReactNode;
}) {
  const [open, setOpen] = usePersistedBoolean(persistKey, defaultOpen);
  return (
    <CollapsibleShell
      title={title}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      {children}
    </CollapsibleShell>
  );
}

function CollapsibleShell({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start text-left text-sm font-medium w-full"
      >
        <span
          aria-hidden="true"
          className="text-neutral-400 transition hover:text-fg-body"
        >
          {open ? '▾' : '▸'}
        </span>
        {title}
      </button>
      {open && children}
    </div>
  );
}
