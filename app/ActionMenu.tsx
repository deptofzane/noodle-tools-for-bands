'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Small kebab (⋯) dropdown for row-level actions. Closes on outside click
 * or Escape, and after any item is chosen. Pair with `ActionMenuItem` for
 * consistently styled entries:
 *
 *   <ActionMenu label="Song actions">
 *     <ActionMenuItem destructive onClick={...}>Delete</ActionMenuItem>
 *   </ActionMenu>
 */
export function ActionMenu({
  children,
  label = 'Actions',
  disabled = false,
}: {
  children: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="rounded-md px-4 py-3 md:px-2 md:py-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 z-10 mt-1 min-w-40 overflow-hidden rounded-md border border-neutral-200 bg-white py-1.5 shadow-lg sm:min-w-32 sm:py-1 dark:border-neutral-800 dark:bg-neutral-900"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** A single entry inside an `ActionMenu`. */
export function ActionMenuItem({
  children,
  onClick,
  destructive = false,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-4 py-2 sm:py-3 text-left text-base hover:bg-neutral-100 sm:px-3 sm:py-1.5 sm:text-sm dark:hover:bg-neutral-800 ${
        destructive
          ? 'text-red-600 dark:text-red-400 pt-2 border-t border-gray-700'
          : 'text-neutral-700 dark:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}
