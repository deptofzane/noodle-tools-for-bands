import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Standard page sub-header: a "← <label>" back link, plus an optional
 * right-side action (passed as children). Shared across the section pages
 * so the back-nav markup lives in one place.
 *
 * This is also the single seam through which a generic history-aware "Back"
 * button could later replace the labeled link without touching every page.
 */
export function PageHeader({
  backHref,
  backLabel,
  children,
}: {
  backHref: string;
  backLabel: string;
  /** Optional right-side action (e.g. an "Edit …" link). */
  children?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-2 text-xs text-neutral-500">
      <Link
        href={backHref}
        className="hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ← {backLabel}
      </Link>
      {children}
    </header>
  );
}
