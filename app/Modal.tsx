'use client';

import { useEffect, type ReactNode } from 'react';

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className={`w-full ${SIZE[size]} rounded-lg border p-5 shadow-xl border-line bg-surface`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
