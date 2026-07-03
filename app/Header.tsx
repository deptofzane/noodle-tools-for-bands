'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePendingCount } from './PendingActionProvider';

/**
 * Top-of-page navigation, shown on every signed-in route. Rendered
 * conditionally from `app/layout.tsx` so it stays off the `/login`
 * page.
 *
 * Active-tab matching is intentionally exact: `/bands`, `/calendar`,
 * `/open-conversations`, and `/history` each get their own dedicated
 * highlight. Routes outside this nav (notably `/notes/[conversationId]`)
 * leave the header un-highlighted, which is the least-wrong choice —
 * none of these links is a precise "parent" of that route.
 */
const NAV_LINKS = [
  { href: '/bands', label: 'Bands' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/open-conversations', label: 'Open Conversations' },
  { href: '/history', label: 'History' },
  { href: '/account', label: 'Account' },
] as const;

export function Header() {
  const pathname = usePathname();
  const pendingCount = usePendingCount();

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <nav className="mx-auto flex flex-col flex-wrap sm:flex-row sm:justify-between max-w-3xl items-center gap-1 px-1 sm:px-6 py-3">
        <span className="flex flex-row gap-2 items-center">
          <h3 className="font-serif mb-2 text-4xl ml-10 sm:ml-0">side<span className="text-cyan-600">stage</span></h3>
          {/*
            Reserve a fixed slot so layout doesn't shift when the
            spinner appears/disappears. The slot is always rendered;
            only its visibility flips with pendingCount.
          */}
          <span
            role="status"
            aria-live="polite"
            aria-label={pendingCount > 0 ? 'Loading' : undefined}
            className="ml-2 inline-flex h-5 w-5 items-center justify-center"
          >
            {pendingCount > 0 && (
              <span
                aria-hidden="true"
                className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-cyan-600 dark:border-neutral-700 dark:border-t-cyan-400"
              />
            )}
          </span>
        </span>
        <span className="inline-flex items-center">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={
                  'rounded-md px-3 py-1.5 text-sm transition ' +
                  (isActive
                    ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 text-nowrap'
                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100 text-nowrap')
                }
              >
                {link.label}
              </Link>
            );
          })}
        </span>
      </nav>
    </header>
  );
}
