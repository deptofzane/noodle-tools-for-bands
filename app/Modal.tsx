'use client';

import { useEffect, type ReactNode } from 'react';

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  // Full screen on a phone, for long lists a centred card would cramp;
  // from `sm` up, a tall card that scrolls inside. The caller lays out its
  // own column (a fixed head over a scrolling body).
  sheet: '',
} as const;

/**
 * Shared centered-dialog shell: a dimmed backdrop and a rounded card, with
 * dismissal via backdrop click or Escape (both suppressed while `busy`).
 *
 * Mount it only while open (`{open && <Modal …>}` or an early return) — it has
 * no `open` prop and owns the Escape listener for its lifetime. The caller
 * supplies the card's contents (heading / body / footer).
 */
export function Modal({
  onClose,
  labelledBy,
  busy = false,
  size = 'sm',
  children,
}: {
  onClose: () => void;
  /** id of the heading element, for aria-labelledby. */
  labelledBy?: string;
  /** When true, backdrop click and Escape don't dismiss. */
  busy?: boolean;
  size?: keyof typeof SIZE;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const sheet = size === 'sheet';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${
        sheet ? 'sm:p-4' : 'p-4'
      }`}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className={
          sheet
            ? 'flex h-full w-full flex-col bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:h-[85vh] sm:max-w-lg sm:rounded-lg sm:border sm:border-line sm:p-5 sm:shadow-xl'
            : `w-full ${SIZE[size]} rounded-lg border p-5 shadow-xl border-line bg-surface`
        }
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
