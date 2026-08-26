'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { applyTheme, isTheme } from './theme';

/** localStorage key for the opt-in. Off unless explicitly turned on. */
export const STAGE_ON_LIVE_KEY = 'stageThemeOnLive';

export function stageOnLiveEnabled(): boolean {
  try {
    return localStorage.getItem(STAGE_ON_LIVE_KEY) === 'on';
  } catch {
    return false;
  }
}

/** The screens you're looking at while actually playing. */
function isPerforming(pathname: string): boolean {
  return (
    pathname === '/live' ||
    pathname === '/practice' ||
    pathname.endsWith('/live') ||
    pathname.endsWith('/practice')
  );
}

/**
 * Switches to the Stage theme on the Live and Practice screens, and back on
 * the way out.
 *
 * Opt-in, and off by default: an app that changes its own appearance without
 * being asked is unsettling, and someone practising at a kitchen table
 * doesn't want the lights turned down. Once enabled, though, nobody has to
 * remember to switch before a gig — which is the whole point, since that's
 * the moment you least want to be in Settings.
 *
 * Applied as an *override*, so `ThemeKeeper` stops restoring the stored
 * choice for as long as it's in force; leaving the screen clears it and the
 * chosen theme comes back.
 */
export function StageOnLive() {
  const pathname = usePathname();

  useEffect(() => {
    if (!stageOnLiveEnabled()) return;

    if (isPerforming(pathname)) {
      applyTheme('stage', true);
      return () => {
        // Back to whatever was chosen. Reading storage rather than
        // remembering a value from mount: the picker may have moved it while
        // this was in force.
        let stored: string | null = null;
        try {
          stored = localStorage.getItem('theme');
        } catch {
          // unreadable — fall through to the default below
        }
        applyTheme(isTheme(stored) ? stored : 'light');
      };
    }
  }, [pathname]);

  return null;
}
