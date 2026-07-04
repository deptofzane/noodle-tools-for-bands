import type { ReactNode } from 'react';
import { BackButton } from './BackButton';

/**
 * Standard page sub-header: a history-aware "← Back" control, plus an
 * optional right-side action (passed as children). Shared across the section
 * pages so the back-nav lives in one place.
 *
 * `backHref` is the fallback destination used when there's no in-app history
 * to go back to (fresh load / deep link).
 */
export function PageHeader({
  backHref,
  children,
}: {
  backHref: string;
  /** Optional right-side action (e.g. an "Edit …" link). */
  children?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-2 text-xs text-neutral-500">
      <BackButton fallbackHref={backHref} />
      {children}
    </header>
  );
}
