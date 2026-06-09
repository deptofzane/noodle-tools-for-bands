'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

/**
 * Global in-flight action counter.
 *
 * Lets any client component report "I have a request running" and lets
 * the global Header render a single spinner that reflects "something
 * is happening" without each call site having to invent its own
 * indicator.
 *
 * Design choices:
 *
 * - **Counter, not boolean.** Two concurrent actions (e.g., user edits
 *   a note while a reply is sending) shouldn't race to clear the
 *   indicator. The counter increments on start and decrements on
 *   settle (success OR failure), so the spinner only disappears when
 *   the last in-flight action finishes.
 * - **`trackPending` returns the original promise.** Call sites stay
 *   one-liners and the original return type and error semantics flow
 *   through untouched. If the inner promise rejects, `trackPending`
 *   still decrements the counter (via `try/finally`) and re-throws.
 * - **`usePendingCount` returns 0 outside a provider.** The provider
 *   wraps the entire signed-in layout; the only place that doesn't
 *   have a provider is the login route's stripped layout, where we
 *   don't render the Header anyway. Returning 0 instead of throwing
 *   makes the hook safe to consume from any client subtree.
 *
 * Intentionally NOT tracked: background SSE long-polls and recurring
 * 30-second background polls. Wrapping those would make the spinner
 * appear continuously, defeating the "user-triggered action" signal.
 */

interface PendingActionContextValue {
  pendingCount: number;
  trackPending: <T>(fn: () => Promise<T>) => Promise<T>;
}

const PendingActionContext = createContext<PendingActionContextValue | null>(
  null,
);

export function PendingActionProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);

  const trackPending = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setPendingCount((c) => c + 1);
      try {
        return await fn();
      } finally {
        setPendingCount((c) => c - 1);
      }
    },
    [],
  );

  return (
    <PendingActionContext.Provider value={{ pendingCount, trackPending }}>
      {children}
    </PendingActionContext.Provider>
  );
}

/**
 * Wrap a fetch (or any async function) so the Header spinner reflects
 * its in-flight state. Returns the original promise — same value, same
 * error semantics.
 *
 * Safe to call outside a provider: returns an identity wrapper that
 * just runs `fn` and doesn't touch any counter. This lets utility
 * components be portable.
 */
export function useTrackPending(): <T>(fn: () => Promise<T>) => Promise<T> {
  const ctx = useContext(PendingActionContext);
  if (!ctx) return <T,>(fn: () => Promise<T>) => fn();
  return ctx.trackPending;
}

/**
 * Read the current in-flight count. Returns 0 outside a provider.
 * Header.tsx uses this to render the spinner.
 */
export function usePendingCount(): number {
  const ctx = useContext(PendingActionContext);
  return ctx?.pendingCount ?? 0;
}
