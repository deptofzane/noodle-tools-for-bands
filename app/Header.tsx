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
  { href: '/home', label: 'Home' },
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
  const [unread, setUnread] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Unread-notifications badge. Refetch on navigation and window focus,
  // poll while visible, and clear instantly when the Home feed marks the
  // notifications read (it dispatches `notifications:read`).
  useEffect(() => {
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/notifications', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { unreadCount?: number };
        if (!cancelled) setUnread(data.unreadCount ?? 0);
      } catch {
        // ignore — the badge is best-effort
      }
    };
    void fetchUnread();

    const onFocus = () => void fetchUnread();
    const onRead = () => setUnread(0);
    window.addEventListener('focus', onFocus);
    window.addEventListener('notifications:read', onRead);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchUnread();
    }, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('notifications:read', onRead);
      clearInterval(interval);
    };
  }, [pathname]);

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
          <Link key="/home" href="/home">
            <h3 className="mb-2 font-serif text-4xl">
              side<span className="text-cyan-600">stage</span>
            </h3>
          </Link>
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
                {link.href === '/home' && <NavBadge count={unread} />}
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
                      'flex items-center rounded px-4 py-3 text-base ' +
                      (isActive
                        ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                        : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800')
                    }
                  >
                    {link.label}
                    {link.href === '/home' && <NavBadge count={unread} />}
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

/** Unread-count pill shown next to the Home link. */
function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread notifications`}
      className="ml-1.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-blue-600 px-1 py-0.5 text-[10px] font-semibold leading-none text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
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
