'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCurrentBand } from './CurrentBandProvider';
import { startRouteProgress } from './RouteProgress';

interface NavLink {
  href: string;
  label: string;
  /** Desktop: lives in the ☰ menu instead of inline in the bar. */
  menuOnly?: boolean;
  /** Mobile: shown as an icon tab in the bar instead of in the ☰ menu. */
  icon?: ReactNode;
}

/**
 * Primary navigation, shown on every signed-in route. Rendered conditionally
 * from `app/layout.tsx` so it stays off the `/login` page.
 *
 * It's pinned to the bottom of the viewport on mobile (thumb-reachable, like a
 * native tab bar) and to the top on desktop — one fixed bar, flipped by a
 * breakpoint, so there's no duplicate markup or JS measuring. Since it's out
 * of flow either way, it publishes its measured height as `--app-nav-h`;
 * `body.has-app-nav` turns that into page padding on the matching side, and
 * the playlist player bar sits above it on mobile.
 *
 * Which links sit in the bar differs by breakpoint, as a pure CSS split —
 * both variants render and `hidden`/`lg:hidden` picks one, so there's no
 * viewport measuring and no flash:
 *
 * - Desktop: every link but the `menuOnly` ones, inline as text.
 * - Mobile: the `icon` links only, as icon-over-label tabs (native app
 *   style), since a phone bar can't hold the full list.
 *
 * The hamburger holds the remainder at either width, plus the Band panel —
 * the current-band picker, which has no inline form. It opens upward on
 * mobile and downward on desktop, following the bar.
 *
 * The dropdown is a two-level drill-down rather than a nested submenu:
 * choosing "Band" swaps the menu's contents for the band list (plus a "Back"
 * row), so entries stay full-width and thumb-sized on a phone.
 *
 * Active-tab matching is intentionally exact: `/bands`, `/calendar`,
 * `/open-conversations`, and `/history` each get their own dedicated
 * highlight. Routes outside this nav (notably `/notes/[conversationId]`)
 * leave the header un-highlighted, which is the least-wrong choice —
 * none of these links is a precise "parent" of that route.
 */
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  // Which level of the ☰ menu is showing: false = top, true = the Band panel,
  // which takes over the whole dropdown until "Back".
  const [bandsOpen, setBandsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { bands, bandId: selectedBandId, band, setBandId } = useCurrentBand();
  const menuRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  /** Shut the dropdown, back at its top level for the next open. */
  const closeMenu = () => {
    setMenuOpen(false);
    setBandsOpen(false);
  };

  const selectBand = (id: string) => {
    setBandId(id);
    closeMenu();
    startRouteProgress(); // a button, so the link-click listener can't see it
    router.push(`/bands/${id}`);
  };

  // "Overview" and "Audio" jump to the currently-selected band's pages.
  const overviewHref = selectedBandId ? `/bands/${selectedBandId}` : '/bands';
  const currentBandName = band?.name ?? 'Select band';
  const audioHref = selectedBandId
    ? `/bands/${selectedBandId}/audio`
    : '/bands';
  const navLinks: NavLink[] = [
    { href: '/home', label: 'Home' },
    { href: overviewHref, label: 'Overview', icon: <OverviewIcon /> },
    { href: audioHref, label: 'Audio', icon: <AudioIcon /> },
    { href: '/calendar', label: 'Calendar', icon: <CalendarIcon /> },
    // { href: '/bands', label: 'Bands' },
    {
      href: '/open-conversations',
      label: 'Open Conversations',
      menuOnly: true,
    },
    { href: '/history', label: 'History' },
    { href: '/settings', label: 'Settings', menuOnly: true },
  ];
  // Desktop: everything but `menuOnly` sits inline in the bar.
  const inlineLinks = navLinks.filter((l) => !l.menuOnly);
  const desktopMenuLinks = navLinks.filter((l) => l.menuOnly);
  // Mobile: the `icon` links are tabs in the bar itself; the rest stay in ☰.
  const mobileTabs = navLinks.filter((l) => l.icon);
  const mobileMenuLinks = navLinks.filter((l) => !l.icon);

  // Close the menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
    setBandsOpen(false);
  }, [pathname]);

  // Unread-notifications badge. Refetch on navigation and window focus,
  // poll while visible, and clear instantly when the Home feed marks the
  // notifications read (it dispatches `notifications:read`).
  useEffect(() => {
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/notifications/unread', {
          cache: 'no-store',
        });
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

  // Publish the bar's height so the page can reserve matching space and the
  // player bar can stack on top of it. Re-measures on resize, on font scaling,
  // and when the band picker appears/disappears.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const apply = () =>
      root.style.setProperty('--app-nav-h', `${bar.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--app-nav-h');
    };
  }, []);

  // While open, close on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      // The scrim closes on its own `click`, one event later. Closing here
      // would unmount it between press and release, and the release would
      // land on whatever it was covering.
      if (e.target === scrimRef.current) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      // Escape backs out one level, same as the "Back" row: the Band panel
      // first, then the menu itself.
      if (e.key !== 'Escape') return;
      if (bandsOpen) setBandsOpen(false);
      else setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, bandsOpen]);

  return (
    // z-[45] sits above the player bar (z-40): on mobile the menu opens upward
    // out of this bar and over the player, and being positioned, this bar is a
    // stacking context the menu can't escape however high its own z-index
    // goes. Still below modals, the full-screen player and Live (z-50+), which
    // are meant to cover the nav.
    <div
      id="app-nav"
      ref={barRef}
      className="fixed inset-x-0 bottom-0 z-[45] border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] lg:bottom-auto lg:top-0 lg:border-b lg:border-t-0 lg:pb-0 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Swallows the tap that dismisses the menu, so closing it can't also
          hit a link or a play button underneath. Sits below the menu (z-50)
          but above the rest of this bar, which means the bar's own buttons
          need a second tap too — dismissing is its own action. Tinted, so
          it's visible enough to read as "tap here to close", but lighter
          than the modal backdrop (black/40): this dims a menu, not the app.
          
          Mobile only. A mis-tap costs a thumb far more than a mouse, and on
          desktop the outside-click listener below already closes the menu
          without a second click. `hidden` there means it isn't hit-testable,
          so that listener sees the real target as it always did. */}
      {menuOpen && (
        <div
          ref={scrimRef}
          aria-hidden="true"
          onClick={closeMenu}
          className="fixed inset-0 z-40 bg-black/25 lg:hidden dark:bg-black/40"
        />
      )}

      <nav className="mx-auto flex max-w-5xl flex-row items-center justify-between gap-1 px-3 py-3 lg:px-6 bg-white dark:bg-neutral-900">
        <span className="flex flex-row items-center gap-2">
          <Link key="/home" href="/home">
            <h3 className="mb-2 font-serif text-4xl hidden lg:inline">
              side<span className="text-cyan-600">stage</span>
            </h3>
            <span className="w-8 h-8 flex items-center justify-center lg:hidden border border-cyan-600 rounded-full">
              <h3 className="font-serif text-2xl text-center mb-1">s</h3>
            </span>
          </Link>
        </span>

        {/*
          Mobile: the everyday destinations as icon tabs in the bar itself,
          native-app style. Desktop shows them as inline text links instead
          (see the right cluster), so this strip is mobile-only.
        */}
        <span className="flex min-w-0 flex-1 items-center justify-between gap-1 lg:hidden max-w-[60vw]">
          {mobileTabs.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.label}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={
                  'flex min-w-0 flex-col items-center gap-1 rounded-md px-2 py-1 ' +
                  (isActive
                    ? 'font-medium text-cyan-600 dark:text-cyan-400'
                    : 'minor-text-theme-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100')
                }
              >
                {link.icon}
                <span className="max-w-full truncate text-[0.625rem] leading-none">
                  {link.label}
                </span>
              </Link>
            );
          })}
        </span>

        {/* Right cluster: nav (inline on desktop) + the ☰ menu. */}
        <div className="flex items-center gap-2">
          {/* Desktop: inline links. */}
          <span className="hidden items-center lg:inline-flex lg:gap-1">
            {inlineLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.label}
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

          {/*
            The ☰ dropdown. On mobile it's the whole nav; on desktop, where the
            everyday links are already inline, it narrows to the Band panel and
            the `menuOnly` links.
          */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls="app-nav-menu"
              aria-label="Menu"
              className="rounded-md px-3 pt-2 pb-3 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 lg:py-2 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <span aria-hidden="true" className="block text-xl leading-none">
                ☰
              </span>
            </button>
            {menuOpen && (
              <div
                id="app-nav-menu"
                role="menu"
                // Opens upward from the mobile bar at the bottom, downward from
                // the desktop bar at the top.
                className="absolute bottom-full right-0 z-50 mb-2 flex min-w-56 max-w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-0.5 rounded-md border border-neutral-200 bg-white p-1.5 shadow-lg lg:bottom-auto lg:top-full lg:mb-0 lg:mt-2 dark:border-neutral-800 dark:bg-neutral-900"
              >
                {bandsOpen ? (
                  // Band panel: it replaces the top level rather than nesting
                  // under it, so the list stays readable on a phone.
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setBandsOpen(false)}
                      className={menuItemClass(false) + ' gap-2'}
                    >
                      <span aria-hidden="true" className="shrink-0">
                        ‹
                      </span>
                      Back
                    </button>

                    <span
                      aria-hidden="true"
                      className="my-1 border-t border-neutral-200 dark:border-neutral-800"
                    />

                    <Link
                      href="/bands"
                      role="menuitem"
                      aria-current={pathname === '/bands' ? 'page' : undefined}
                      onClick={closeMenu}
                      className={menuItemClass(pathname === '/bands')}
                    >
                      View bands
                    </Link>
                    {bands.map((b) => {
                      const isCurrent = b.id === selectedBandId;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isCurrent}
                          onClick={() => selectBand(b.id)}
                          className={menuItemClass(isCurrent) + ' gap-2'}
                        >
                          <span
                            aria-hidden="true"
                            className="w-3 shrink-0 text-center text-xs minor-text-theme-colors"
                          >
                            {isCurrent ? '✓' : ''}
                          </span>
                          <span className="min-w-0 truncate">{b.name}</span>
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {bands.length > 0 && (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setBandsOpen(true)}
                          className={menuItemClass(false) + ' gap-2'}
                        >
                          <span className="font-medium">Band</span>
                          <span className="ml-auto flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm minor-text-theme-colors">
                              {currentBandName}
                            </span>
                            <span
                              aria-hidden="true"
                              className="shrink-0 text-neutral-400"
                            >
                              ›
                            </span>
                          </span>
                        </button>

                        <span
                          aria-hidden="true"
                          className="my-1 border-t border-neutral-200 dark:border-neutral-800"
                        />
                      </>
                    )}

                    {/* Whatever the bar doesn't already show: on mobile the
                        non-tab links, on desktop the `menuOnly` ones. */}
                    <span
                      role="none"
                      className="flex flex-col gap-0.5 lg:hidden"
                    >
                      {mobileMenuLinks.map((link) => (
                        <MenuLink
                          key={link.label}
                          href={link.href}
                          label={link.label}
                          isActive={pathname === link.href}
                          onClick={closeMenu}
                          unread={unread}
                        />
                      ))}
                    </span>
                    <span
                      role="none"
                      className="hidden flex-col gap-0.5 lg:flex"
                    >
                      {desktopMenuLinks.map((link) => (
                        <MenuLink
                          key={link.label}
                          href={link.href}
                          label={link.label}
                          isActive={pathname === link.href}
                          onClick={closeMenu}
                          unread={unread}
                        />
                      ))}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}

/** Unread-count pill shown next to the Home link. */
function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread notifications`}
      className="ml-1.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-blue-600 px-1 py-0.5 text-[0.625rem] font-semibold leading-none text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Tab-bar icons. Drawn on the same 24×24 grid with a 2px stroke so they sit
 * evenly next to each other, and inheriting `currentColor` so the active
 * state colors the icon and its label together.
 */
function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** Overview — a dashboard of the band's panels. */
function OverviewIcon() {
  return (
    <TabIcon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </TabIcon>
  );
}

/** Audio — an eighth note. */
function AudioIcon() {
  return (
    <TabIcon>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </TabIcon>
  );
}

/** Calendar — a month grid with its torn-off header. */
function CalendarIcon() {
  return (
    <TabIcon>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4" />
    </TabIcon>
  );
}

/** One nav destination inside the ☰ dropdown. */
function MenuLink({
  href,
  label,
  isActive,
  onClick,
  unread,
}: {
  href: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  /** Unread count, badged on the Home entry. */
  unread: number;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className={menuItemClass(isActive)}
    >
      {label}
      {href === '/home' && <NavBadge count={unread} />}
    </Link>
  );
}

/** Shared classes for an entry in the ☰ dropdown, active or not. */
function menuItemClass(isActive: boolean): string {
  return (
    'flex w-full items-center rounded px-4 py-3 text-left text-base lg:px-3 lg:py-2 lg:text-sm ' +
    (isActive
      ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
      : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800')
  );
}

/** Shared classes for a desktop nav link, active or not. */
function navLinkClass(isActive: boolean): string {
  return (
    'text-nowrap rounded-md px-3 py-1.5 text-sm transition ' +
    (isActive
      ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100')
  );
}
