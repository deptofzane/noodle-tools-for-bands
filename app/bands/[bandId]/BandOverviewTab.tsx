'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDateLong, formatDateShort, formatTimeRange } from '@/lib/format';
import { usePersistedBoolean } from '../../usePersistedBoolean';
import { MinimizeToggle, type Show } from './bandDetailShared';

/**
 * The Overview tab: upcoming Shows, Past shows, and (for non-owners) a Leave
 * button. Owns its own collapse/expand UI state; the parent supplies the data
 * and the leave handler.
 */
export function BandOverviewTab({
  bandId,
  shows,
  isOwner,
  onLeave,
}: {
  bandId: string;
  shows: Show[];
  isOwner: boolean;
  onLeave: () => void;
}) {
  const [showsMinimized, setShowsMinimized] = usePersistedBoolean(
    'bandShowsMinimized',
    false,
  );
  const [pastShowsMinimized, setPastShowsMinimized] = usePersistedBoolean(
    'bandPastShowsMinimized',
    true,
  );
  const [expandedShows, setExpandedShows] = useState<Set<string>>(new Set());

  const toggleShowExpanded = (id: string) =>
    setExpandedShows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Split shows by today's local date. Upcoming soonest-first; past kept
  // newest-first (the API order).
  const todayStr = (() => {
    const n = new Date();
    const p = (x: number) => x.toString().padStart(2, '0');
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
  })();
  const upcomingShows = shows
    .filter((s) => s.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const pastShows = shows.filter((s) => s.date < todayStr);

  const renderShow = (show: Show) => {
    const expanded = expandedShows.has(show.id);
    return (
      <li
        key={show.id}
        className="rounded-lg border border-neutral-200 dark:border-neutral-800"
      >
        <button
          type="button"
          onClick={() => toggleShowExpanded(show.id)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left md:px-3 md:py-1.5"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="text-sm leading-none text-neutral-400"
            >
              {expanded ? '▾' : '▸'}
            </span>
            <span className="truncate font-medium">{show.title}</span>
          </span>
          <span className="shrink-0 text-xs text-neutral-500">
            {formatDateShort(show.date)}
          </span>
        </button>
        {expanded && (
          <div className="flex flex-col gap-1 border-t border-neutral-200 px-4 py-3 text-sm md:px-3 dark:border-neutral-800">
            <div>
              <span className="font-medium">Date:</span>{' '}
              {formatDateLong(show.date)}
            </div>
            {show.time && (
              <div>
                <span className="font-medium">Time:</span>{' '}
                {formatTimeRange(show.time, show.endTime)}
              </div>
            )}
            {show.location && (
              <div>
                <span className="font-medium">Location:</span> {show.location}
              </div>
            )}
            {show.setlistId && (
              <div>
                <span className="font-medium">Setlist:</span>{' '}
                <Link
                  href={`/bands/${bandId}/setlists/${show.setlistId}`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {show.setlistName ?? 'View setlist'}
                </Link>
              </div>
            )}
            {show.details && (
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Details:</span>
                <p className="whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
                  {show.details}
                </p>
              </div>
            )}
            <Link
              href={`/calendar/events/${show.id}`}
              className="mt-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              View event →
            </Link>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <MinimizeToggle
              minimized={showsMinimized}
              onToggle={() => setShowsMinimized((v) => !v)}
              label="Events"
            >
              <h2 className="text-sm font-medium">Events</h2>
            </MinimizeToggle>
          </span>
          <Link
            href={`/calendar/events/new?bandId=${bandId}`}
            className="btn-outline"
          >
            Add event
          </Link>
        </div>
        {!showsMinimized &&
          (upcomingShows.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {upcomingShows.map(renderShow)}
            </ul>
          ) : (
            <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
              No upcoming events. Use “Add event” to schedule one.
            </p>
          ))}
      </section>

      {pastShows.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MinimizeToggle
              minimized={pastShowsMinimized}
              onToggle={() => setPastShowsMinimized((v) => !v)}
              label="Past events"
            >
              <h2 className="text-sm font-medium text-neutral-500">
                Past events
              </h2>
            </MinimizeToggle>
          </div>
          {!pastShowsMinimized && (
            <ul className="flex flex-col gap-2">{pastShows.map(renderShow)}</ul>
          )}
        </section>
      )}

      {!isOwner && (
        <button
          type="button"
          onClick={onLeave}
          className="shrink-0 rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 mt-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          Leave band
        </button>
      )}
    </>
  );
}
