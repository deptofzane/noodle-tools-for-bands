'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The setlist position indicator turned into a jump-to menu: the trigger shows
 * whatever the caller passes (e.g. "3 / 12"), and opening it lists every song
 * in order so the user can navigate to any one. Shared by the Practice and
 * Live screens. Closes on outside click, Escape, or after a selection.
 */
export function SetlistNav({
  songs,
  current,
  onSelect,
  align = 'center',
  children,
}: {
  songs: { title: string; isMarker?: boolean }[];
  current: number;
  onSelect: (index: number) => void;
  align?: 'left' | 'center' | 'right';
  children: ReactNode;
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

  const alignCls =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2';

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Jump to song"
        className="flex min-w-0 max-w-[40vw] md:max-w-[60vw] lg:max-w-[20vw] h-12 items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <span className="min-w-0 truncate">{children}</span>
        <span aria-hidden="true" className="text-neutral-400">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className={
            'absolute top-full z-50 mt-1 max-h-[60vh] w-64 max-w-[80vw] overflow-auto rounded-md border border-neutral-200 bg-white py-1 text-left shadow-lg dark:border-neutral-800 dark:bg-neutral-900 ' +
            alignCls
          }
        >
          {songs.map((s, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(i);
                setOpen(false);
              }}
              className={
                'flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ' +
                (i === current
                  ? 'bg-neutral-100 font-medium dark:bg-neutral-800'
                  : 'text-neutral-700 dark:text-neutral-200')
              }
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                {i + 1}
              </span>
              <span
                className={
                  'min-w-0 truncate ' +
                  (s.isMarker
                    ? 'text-xs font-semibold uppercase tracking-wide text-neutral-500'
                    : '')
                }
              >
                {s.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
