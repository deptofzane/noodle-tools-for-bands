'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/** Subscribers to manual `startRouteProgress()` calls. */
const listeners = new Set<() => void>();

/**
 * Show the bar for a navigation the click listener can't see — a
 * `router.push()` fired from a button. Pair it with the push itself; the bar
 * still finishes on its own when the new route commits.
 */
export function startRouteProgress() {
  for (const l of listeners) l();
}

/** How far the bar creeps while waiting. It never reaches the end on its own. */
const CEILING = 90;
/** Nothing should hold the bar longer than this; it gives up and completes. */
const MAX_MS = 10_000;

/**
 * Top-of-viewport loading bar for page navigations.
 *
 * App Router has no router-events API, so this reads the two moments directly:
 * a capture-phase click on any in-app link starts the bar (capture, because
 * `Link` calls `preventDefault()` in its own handler), and a change of
 * pathname or query means the new route has committed, which finishes it.
 * Programmatic navigations opt in via `startRouteProgress()`.
 *
 * The progress itself is invented — the server gives no completion ratio — so
 * it eases toward `CEILING` and only snaps to 100% on commit, the familiar
 * pattern from browser and CI progress bars. A watchdog completes the bar if a
 * navigation never lands (a click we misread, a request that dies), so it can
 * never sit on screen forever.
 *
 * Decorative by design: Next announces route changes to screen readers on its
 * own, so the bar is `aria-hidden` rather than a second live region competing
 * with the nav's action spinner.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(0);
  const [active, setActive] = useState(false);
  // Timers live in refs: they're cleared from callbacks that outlive renders.
  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (creepRef.current) clearInterval(creepRef.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    creepRef.current = null;
    watchdogRef.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setValue(100);
    // Let the fill animate to full, then fade out and reset for the next run.
    doneRef.current = setTimeout(() => {
      setActive(false);
      setValue(0);
    }, 220);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    if (doneRef.current) clearTimeout(doneRef.current);
    setActive(true);
    setValue(8);
    // Decaying steps: quick at first, crawling as it nears the ceiling, so a
    // slow page still looks alive without ever implying it's nearly done.
    creepRef.current = setInterval(() => {
      setValue((v) =>
        v >= CEILING ? v : v + Math.max(0.4, (CEILING - v) / 8),
      );
    }, 300);
    watchdogRef.current = setTimeout(finish, MAX_MS);
  }, [finish]);

  // A navigation committed (or this is the first render) — complete the bar.
  // Keyed on the query *string*, not the params object: an unrelated re-render
  // handing back a fresh object would otherwise cut a live bar short.
  const query = searchParams.toString();
  useEffect(() => {
    finish();
  }, [pathname, query, finish]);

  useEffect(() => {
    const unsubscribe = () => listeners.delete(start);
    listeners.add(start);

    const onClick = (e: MouseEvent) => {
      // Only a plain left-click navigates in-page; the rest open tabs/windows
      // or are the browser's business.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      // `instanceof` rather than a null check: an SVG <a> also matches the
      // selector but has none of the properties read below.
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return; // malformed href — let the browser deal with it
      }
      // Off-site links leave the app, and a link to where we already are (or a
      // hash on this page) never re-renders, so neither gets a bar.
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      start();
    };

    // Capture phase: `Link`'s own handler calls `preventDefault()` during
    // bubble, so by then the click looks cancelled rather than navigating.
    document.addEventListener('click', onClick, true);
    // Back/forward can re-render a server component too.
    window.addEventListener('popstate', start);
    return () => {
      unsubscribe();
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', start);
    };
  }, [start]);

  // Tear down any pending timer if the app unmounts mid-navigation.
  useEffect(
    () => () => {
      clearTimers();
      if (doneRef.current) clearTimeout(doneRef.current);
    },
    [clearTimers],
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
    >
      <div
        data-route-progress={active ? 'active' : 'idle'}
        className="h-full bg-cyan-600 shadow-[0_0_8px_rgba(8,145,178,0.6)] transition-[width,opacity] duration-200 ease-out dark:bg-cyan-400"
        style={{ width: `${value}%`, opacity: active ? 1 : 0 }}
      />
    </div>
  );
}
