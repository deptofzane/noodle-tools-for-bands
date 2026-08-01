import type { ReactNode } from 'react';
import { BackButton } from './BackButton';
import { CurrentBandName } from './CurrentBandName';

/**
 * Standard page sub-header: a history-aware "← Back" control and the current
 * band's name, plus an optional right-side action (passed as children).
 * Shared across the section pages so the back-nav lives in one place.
 *
 * `defaultHref` is the fallback destination used when there's no in-app history
 * or the default link when canGoBack is false
 * to go back to (fresh load / deep link).
 */
export function PageHeader({
  defaultHref,
  defaultHrefName,
  canGoBack = true,
  children,
}: {
  defaultHref: string;
  defaultHrefName?: string;
  canGoBack?: boolean;
  /** Optional right-side action (e.g. an "Edit …" link). */
  children?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-2 text-xs text-neutral-500">
      <span className="flex min-w-0 items-center gap-2">
        <BackButton
          defaultHref={defaultHref}
          canGoBack={canGoBack}
          defaultHrefName={defaultHrefName ?? null}
        />
        <CurrentBandName />
      </span>
      {children}
    </header>
  );
}
