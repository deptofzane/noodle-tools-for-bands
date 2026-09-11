'use client';

import { useEffect, useState, type ReactNode } from 'react';

type HomeTab = 'notifications' | 'activity';
const STORAGE_KEY = 'homeTab';

const TABS: { key: HomeTab; label: string }[] = [
  { key: 'notifications', label: 'Notifications' },
  { key: 'activity', label: 'Activity' },
];

/**
 * Home's two tabs, as a centred pair of pills.
 *
 * **Only the open panel is mounted, and neither is until the remembered tab is
 * known.** Both halves of that are load-bearing. The notification feed marks
 * everything read the moment it mounts, so a panel hidden with CSS — or one
 * rendered as the default for a frame and then swapped for the saved tab —
 * would clear the unread badge for notifications nobody looked at. The panels
 * arrive as elements, so the one not chosen is never mounted at all.
 *
 * The unread count rides on the Notifications pill while Activity is open;
 * otherwise the nav's Home badge would light up on the page you're already
 * on, with nothing visible to explain it.
 */
export function HomeTabs({
  notifications,
  activity,
  unread,
}: {
  notifications: ReactNode;
  activity: ReactNode;
  unread: number;
}) {
  // Null until the saved choice is read, which can only happen after mount.
  const [tab, setTab] = useState<HomeTab | null>(null);
  // The count at page load, zeroed once the feed marks things read — it
  // announces that with the same event the nav badge listens for. Without
  // this, reading your notifications and switching to Activity would put the
  // old number straight back on the pill.
  const [unreadCount, setUnreadCount] = useState(unread);

  useEffect(() => {
    const cleared = () => setUnreadCount(0);
    window.addEventListener('notifications:read', cleared);
    return () => window.removeEventListener('notifications:read', cleared);
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // storage unavailable — fall through to the default
    }
    setTab(saved === 'activity' ? 'activity' : 'notifications');
  }, []);

  const choose = (next: HomeTab) => {
    setTab(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable — the choice still holds for this visit
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Home"
        className="mx-auto inline-flex gap-1 rounded-full border border-line p-1"
      >
        {TABS.map((t) => {
          const selected = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`home-tab-${t.key}`}
              aria-selected={selected}
              aria-controls="home-tabpanel"
              onClick={() => choose(t.key)}
              className={
                'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ' +
                (selected
                  ? 'bg-accent-fill text-accent'
                  : 'minor-text-theme-colors hover:bg-surface-hover')
              }
            >
              {t.label}
              {t.key === 'notifications' && !selected && unreadCount > 0 && (
                <span className="rounded-full bg-blue-600 px-1.5 text-[0.625rem] font-semibold leading-4 text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab && (
        <div
          role="tabpanel"
          id="home-tabpanel"
          aria-labelledby={`home-tab-${tab}`}
        >
          {tab === 'notifications' ? notifications : activity}
        </div>
      )}
    </div>
  );
}
