'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Route-level error boundary: catches anything thrown while rendering a page
 * under the root layout, so the nav bar and the player survive.
 *
 * This matters more than it looks in an installed app. There's no address bar
 * to retype a URL into, so without a boundary a render error leaves someone
 * staring at a blank screen with no way out but force-quitting.
 *
 * `reset()` re-renders the segment, which is enough for a transient failure
 * (a fetch that timed out); the Home link is the way out when it isn't.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep this — it's the only record of a client-side crash until real
    // error reporting is wired up.
    console.error('[route error]', error);
  }, [error]);

  return (
    <main className="main-container">
      <div className="mt-10 flex flex-col items-center gap-4 rounded-lg border border-line px-4 py-10 text-center">
        <h1 className="title-text">Something went wrong</h1>
        <p className="max-w-sm text-sm minor-text-theme-colors">
          This page didn’t load. Trying again often works — if it doesn’t, head
          back and come at it from another direction.
        </p>
        {error.digest && (
          // The server-side counterpart of this error is logged under the same
          // digest, so quoting it makes a report actionable.
          <p className="font-mono text-xs text-neutral-400">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/home" className="btn-outline">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
