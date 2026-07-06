'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePendingCount } from './PendingActionProvider';

/**
 * Top-of-page navigation, shown on every signed-in route. Rendered
 * conditionally from `app/layout.tsx` so it stays off the `/login`
 * page.
 *
 * The links show inline on desktop and collapse into a hamburger dropdown
 * on mobile (a pure CSS breakpoint split: both variants render, and
 * `hidden`/`sm:hidden` picks one — no viewport measuring, no flash).
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  // While open, close on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <nav className="mx-auto flex max-w-3xl flex-row items-center justify-between gap-1 px-3 py-3 sm:px-6">
        <span className="flex flex-row items-center gap-2">
          <h3 className="mb-2 font-serif text-4xl">
            side<span className="text-cyan-600">stage</span>
          </h3>
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

        {/* Desktop: inline links. */}
        <span className="hidden items-center sm:inline-flex">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={navLinkClass(isActive)}
              >
                {link.label}
              </Link>
            );
          })}
        </span>

        {/* Mobile: hamburger dropdown. */}
        <div ref={menuRef} className="relative sm:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label="Menu"
            className="rounded-md px-3 pt-2 pb-3 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <span aria-hidden="true" className="block text-xl leading-none">
              ☰
            </span>
          </button>
          {menuOpen && (
            <div
              id="mobile-nav"
              role="menu"
              className="absolute right-0 z-50 mt-2 flex min-w-56 flex-col gap-0.5 rounded-md border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
            >
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    role="menuitem"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={
                      'rounded px-4 py-3 text-base ' +
                      (isActive
                        ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                        : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800')
                    }
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

/** Shared classes for a desktop nav link, active or not. */
function navLinkClass(isActive: boolean): string {
  return (
    'text-nowrap rounded-md px-3 py-1.5 text-sm transition ' +
    (isActive
      ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100')
  );
}
