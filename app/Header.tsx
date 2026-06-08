'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Top-of-page navigation, shown on every signed-in route. Rendered
 * conditionally from `app/layout.tsx` so it stays off the `/login`
 * page.
 *
 * Active-tab matching is intentionally exact: `/library` is the
 * Picker page; `/library/annotated` and `/library/history` get their
 * own dedicated highlight. Routes outside this nav (notably
 * `/notes/[fileId]`) leave the header un-highlighted, which is the
 * least-wrong choice — none of these links is a precise "parent" of
 * that route.
 */
const NAV_LINKS = [
  { href: '/library', label: 'Library' },
  { href: '/library/annotated', label: 'Open Conversations' },
  { href: '/library/history', label: 'History' },
  { href: '/account', label: 'Account' },
] as const;

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <nav className="mx-auto flex justify-between max-w-3xl items-center gap-1 px-6 py-3">
        <h3 className="font-serif mb-2 text-4xl">side<span className="text-cyan-600">stage</span></h3>
        <span>
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
                    ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100')
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
