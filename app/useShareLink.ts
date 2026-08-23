'use client';

import { useCallback } from 'react';
import { useToast } from './ToastProvider';

/**
 * Copy a link to something, and say so.
 *
 * One implementation because there are now five menus offering it, and the
 * two things that are easy to get wrong should only be got right once: the
 * URL is built from an app path rather than read off the address bar, and a
 * refusal is reported rather than swallowed.
 *
 * Clipboard access is unavailable outside a secure context and can be denied
 * outright. Staying silent there would leave someone pasting whatever they
 * copied earlier, believing it was this — so a failure gets a plain error
 * toast. It deliberately doesn't suggest the address bar: most of these are
 * offered from a list, where the address bar is the list, not the item.
 */
export function useShareLink(): (path: string, noun: string) => Promise<void> {
  const showToast = useToast();
  return useCallback(
    async (path: string, noun: string) => {
      const url = `${window.location.origin}${path}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast(`${noun} link copied.`, 'success');
      } catch {
        showToast('Couldn’t copy the link — your browser blocked it.');
      }
    },
    [showToast],
  );
}
