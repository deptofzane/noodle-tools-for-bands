'use client';

import Link from 'next/link';
import { useCurrentBand } from './CurrentBandProvider';

/**
 * The current band's name, for the page sub-header — so every screen says
 * which band it's showing. Links to that band's page, and renders nothing
 * until the band list has loaded (or when the user has no bands), so it never
 * leaves a placeholder behind.
 */
export function CurrentBandName() {
  const { band } = useCurrentBand();
  if (!band) return null;

  return (
    <>
      {/* Separator lives here so it can't be left stranded by the null case. */}
      <span
        aria-hidden="true"
        className="shrink-0 text-neutral-300 dark:text-neutral-700"
      >
        |
      </span>
      <Link
        href={`/bands/${band.id}`}
        title={band.name}
        className="min-w-0 truncate font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
      >
        {band.name}
      </Link>
    </>
  );
}
