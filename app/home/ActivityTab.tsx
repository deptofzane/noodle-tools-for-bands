'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { EventListItem } from '@/lib/db/events';
import type { Todo } from '@/lib/db/todos';
import { todoHref } from '@/lib/routes';
import { Select } from '../Select';
import { TodoSummary } from '../bands/[bandId]/TodoRow';
import { todoTone } from '../bands/[bandId]/todos/todoTone';
import { ActivityWeek } from './ActivityWeek';
import { OpenPolls, type OpenPoll } from './OpenPolls';
import { RecentEvents } from './RecentEvents';

const ALL = 'all';
const STORAGE_KEY = 'homeActivityBand';

/**
 * Home's Activity tab: your todos, the week ahead, open polls and the week
 * behind, narrowed by one band picker.
 *
 * Everything arrives in one server fetch covering every band, and the picker
 * filters it here. "All bands" needs the whole set anyway, so switching bands
 * costs no request and can't show a spinner.
 *
 * The picker narrows what's *listed*. It does not narrow what you're allowed
 * to do: Recent events decides whether to offer the band-private notes button
 * from your full membership, not from this selection.
 */
export function ActivityTab({
  currentUserId,
  bands,
  todos,
  events,
  nextEvent,
  polls,
  serverToday,
}: {
  currentUserId: string;
  bands: { id: string; name: string }[];
  todos: Todo[];
  events: EventListItem[];
  nextEvent: EventListItem | null;
  polls: OpenPoll[];
  serverToday: string;
}) {
  const [band, setBand] = useState(ALL);

  // Remembered per device. Restored after mount so the server and first client
  // render agree; a band you've since left falls back to All.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && bands.some((b) => b.id === saved)) setBand(saved);
    } catch {
      // storage unavailable — All bands it is
    }
    // Once, on mount; the band list is fixed for this render of Home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (next: string) => {
    setBand(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable — the choice still holds for this visit
    }
  };

  const all = band === ALL;
  const inBand = <T extends { bandId: string }>(rows: T[]) =>
    all ? rows : rows.filter((r) => r.bandId === band);
  const bandName = new Map(bands.map((b) => [b.id, b.name]));

  // The overall next event only stands in for this band if it *is* this
  // band's; pointing at another band's show under a filter would be wrong.
  const next =
    nextEvent && (all || nextEvent.bandId === band) ? nextEvent : null;

  return (
    <div className="flex flex-col gap-6">
      <Select
        value={band}
        onChange={choose}
        ariaLabel="Band"
        className="w-full sm:w-64"
        options={[
          { value: ALL, label: 'All bands' },
          ...bands.map((b) => ({ value: b.id, label: b.name })),
        ]}
      />

      <section className="flex flex-col gap-2" aria-labelledby="activity-todos">
        <h2 id="activity-todos" className="text-base font-medium">
          Todos
        </h2>
        {inBand(todos).length === 0 ? (
          <p className="rounded-lg border border-line px-4 py-3 text-sm minor-text-theme-colors">
            No active todos.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {inBand(todos).map((t) => (
              <li
                key={t.id}
                data-event-type={todoTone(t.status, t.shared)}
                className="rounded-lg border border-line border-l-[3px] border-l-[color:var(--event-accent)] dark:border-l-[color:var(--event-accent)]"
              >
                {/* Read-only: the todo's own page has its actions. Status,
                    sharing and delete each carry confirmations and refresh
                    rules in the band's Todos tab that don't belong here. */}
                <Link
                  href={todoHref(t.bandId, t.id)}
                  className="flex min-w-0 flex-col gap-0.5 px-4 py-3"
                >
                  <TodoSummary todo={t} currentUserId={currentUserId} />
                  {all && (
                    <span className="text-xs minor-text-theme-colors">
                      {bandName.get(t.bandId)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActivityWeek
        events={inBand(events)}
        nextEvent={next}
        serverToday={serverToday}
      />

      <OpenPolls polls={inBand(polls)} />

      <RecentEvents shows={inBand(events)} bandIds={bands.map((b) => b.id)} />
    </div>
  );
}
