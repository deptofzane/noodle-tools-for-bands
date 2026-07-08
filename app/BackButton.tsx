'use client';

import { useRouter } from 'next/navigation';
import { useCanGoBack } from './NavigationHistoryProvider';

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
      onClick={() =>
        checkUseCanGoBack() && !!canGoBack
          ? router.back()
          : router.push(defaultHref)
      }
      className="hover:text-neutral-900 dark:hover:text-neutral-100 py-4"
    >
      ← {!canGoBack && !!defaultHrefName ? defaultHrefName : 'Back'}
    </button>
  );
}
