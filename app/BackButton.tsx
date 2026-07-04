'use client';

import { useRouter } from 'next/navigation';
import { useCanGoBack } from './NavigationHistoryProvider';

/**
 * "← Back" control. Returns to the last in-app page via `router.back()` when
 * there's in-app history; otherwise navigates to `fallbackHref` (so a fresh
 * load / deep link goes somewhere sensible instead of leaving the app).
 */
export function BackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <button
      type="button"
      onClick={() => (canGoBack() ? router.back() : router.push(fallbackHref))}
      className="hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      ← Back
    </button>
  );
}
