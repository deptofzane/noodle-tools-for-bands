'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Lightweight global toasts.
 *
 * Any client component can call `useToast()` and fire a transient
 * message (mostly action failures) without nuking its own view to show
 * an inline error. Mirrors `PendingActionProvider`: the hook is safe to
 * call outside the provider (returns a no-op), so components stay
 * portable.
 *
 * Toasts auto-dismiss after a few seconds and are click-dismissable.
 */

type ToastType = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'error') => {
      const id = ++idRef.current;
      setToasts((ts) => [...ts, { id, message, type }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/*
        Toasts sit at the opposite end of the screen from the nav bar, which
        is pinned to the bottom until `lg` and to the top from there. So:
        top on phones and tablets — where the bottom also holds the player bar
        — and bottom-right on desktop. `env(safe-area-inset-top)` keeps them
        clear of a notch.

        Anchored on both sides below `lg`, so the width comes from the space
        available rather than being fixed: a `w-full` on a fixed element means
        the whole viewport, which `max-w-sm` then pinned to 384px — and with
        `right-4` also honored, the left edge went negative on anything
        narrower than 400px (most phones).
      */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)_+_1rem)] z-[100] mx-auto flex max-w-sm flex-col gap-2 lg:inset-x-auto lg:top-auto lg:right-4 lg:bottom-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            // `--toast-from` is the distance the entrance travels, and its
            // sign is the direction: negative comes down from the top edge
            // (mobile), positive rises from the bottom (desktop).
            className={
              'toast-in [--toast-from:-0.75rem] lg:[--toast-from:0.75rem] ' +
              'pointer-events-auto flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm shadow-lg ' +
              toastStyles(t.type)
            }
          >
            <span className="min-w-0 break-words">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function toastStyles(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200';
    case 'info':
      return 'border-neutral-300 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';
    case 'error':
    default:
      return 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200';
  }
}

/** Fire a toast. Returns a no-op outside the provider. */
export function useToast(): (message: string, type?: ToastType) => void {
  const ctx = useContext(ToastContext);
  return ctx?.showToast ?? (() => {});
}
