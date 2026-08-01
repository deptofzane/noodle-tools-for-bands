'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ActionMenu, ActionMenuItem } from '../../../ActionMenu';
import { MinimizeToggle, type Conversation } from '../bandDetailShared';
import { dayLabel, groupByDay, timeLabel } from './uploadDays';

/**
 * The Uploads tab: the band's songs grouped by the day they were added, newest
 * day first. Everything added on the same day collapses into a single entry
 * listing those songs in the order they arrived, with a kebab menu for
 * day-level actions. Read-only — per-song actions live on the Songs tab.
 */
export function UploadHistory({
  bandId,
  conversations,
}: {
  bandId: string;
  conversations: Conversation[] | null;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleDay = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!conversations) return null;

  if (conversations.length === 0) {
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        Nothing uploaded yet. Songs you add show up here, grouped by day.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {groupByDay(conversations).map(([key, songs]) => (
        <li
          key={key}
          className="rounded-lg border border-neutral-200 dark:border-neutral-800"
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <MinimizeToggle
              minimized={collapsed.has(key)}
              onToggle={() => toggleDay(key)}
              label={dayLabel(key)}
            >
              <h2 className="text-sm font-medium">{dayLabel(key)}</h2>
            </MinimizeToggle>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-xs text-neutral-500">
                {songs.length} {songs.length === 1 ? 'song' : 'songs'}
              </span>
              <ActionMenu label={`Actions for ${dayLabel(key)}`}>
                <ActionMenuItem
                  onClick={() =>
                    router.push(`/bands/${bandId}/audio/uploads/${key}`)
                  }
                >
                  View tracks
                </ActionMenuItem>
              </ActionMenu>
            </div>
          </div>
          {!collapsed.has(key) && (
            <ul className="divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {songs.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 pr-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <Link
                    href={`/notes/${c.id}?from=audio`}
                    className="min-w-0 flex-1 truncate px-4 py-3 text-sm md:px-3 md:py-1.5"
                  >
                    {c.audioFileName ?? 'Untitled audio'}
                  </Link>
                  {c.archived && (
                    <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      archived
                    </span>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                    {timeLabel(c.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
