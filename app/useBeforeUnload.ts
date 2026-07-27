'use client';

import { useEffect } from 'react';

/**
 * Warns the user via the browser's native prompt before they close or reload
 * the tab while `active` is true — e.g. an upload in progress, which a real
 * page unload would cut off. In-app (soft) navigation is unaffected, so this
 * only guards against genuinely leaving the page. Modern browsers show their
 * own generic message and ignore any custom text.
 */
export function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy assignment some browsers still require to trigger the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
