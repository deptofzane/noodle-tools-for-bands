'use client';

import { useRouter } from 'next/navigation';
import { useCanGoBack } from './NavigationHistoryProvider';
import { startRouteProgress } from './RouteProgress';

/**
 * "← Back" control. Returns to the last in-app page via `router.back()` when
 * there's in-app history; otherwise navigates to `fallbackHref` (so a fresh
 * load / deep link goes somewhere sensible instead of leaving the app).
 */
export function BackButton({
  defaultHref,
  defaultHrefName,
  canGoBack,
}: {
  defaultHref: string;
  defaultHrefName?: string | null;
  canGoBack: boolean;
}) {
  const router = useRouter();
  const checkUseCanGoBack = useCanGoBack();

  return (
    <button
      type="button"
      onClick={() => {
        // A button, so the route bar's link-click listener can't see this one.
        startRouteProgress();
        if (checkUseCanGoBack() && !!canGoBack) router.back();
        else router.push(defaultHref);
      }}
      className="hover:text-neutral-900 dark:hover:text-neutral-100 py-4"
    >
      ← {!canGoBack && !!defaultHrefName ? defaultHrefName : 'Back'}
    </button>
  );
}
