'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/format';
import { MinimizeToggle, type Member } from './bandDetailShared';
import { usePersistedBoolean } from '../../usePersistedBoolean';

interface PollSummary {
  id: string;
  title: string;
  createdAt: string;
  closed: boolean;
}

/**
 * The Polls tab: a Polls section (create + list the band's open polls), the
 * band's members in a collapsible container, and — below that — a collapsible
 * "Closed polls" history (shown only when there are closed polls).
 */
export function BandMembersTab({
  bandId,
  members,
}: {
  bandId: string;
  members: Member[];
}) {
  const [polls, setPolls] = useState<PollSummary[] | null>(null);
  const [closedMinimized, setClosedMinimized] = usePersistedBoolean(
    'bandClosedPollsMinimized',
    true,
  );
  const [membersMinimized, setMembersMinimized] = usePersistedBoolean(
    'bandMembersMinimized',
    false,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bands/${bandId}/polls`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { polls: PollSummary[] };
        if (!cancelled) setPolls(data.polls);
      } catch {
        // best-effort; the section just stays empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bandId]);

  const openPolls = polls?.filter((p) => !p.closed) ?? null;
  const closedPolls = polls?.filter((p) => p.closed) ?? [];

  const renderPollList = (list: PollSummary[]) => (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {list.map((p) => (
        <li key={p.id}>
          <Link
            href={`/bands/${bandId}/polls/${p.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 md:py-1.5 md:px-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            <span className="min-w-0 truncate font-medium">{p.title}</span>
            <span className="shrink-0 text-xs text-neutral-500">
              {formatRelativeTime(p.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Polls</h2>
          <Link href={`/bands/${bandId}/polls/new`} className="btn-outline">
            New poll
          </Link>
        </div>
        {polls && polls.length === 0 && (
          <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
            No polls yet. Use “New poll” to ask the band something.
          </p>
        )}
        {openPolls && openPolls.length > 0 && renderPollList(openPolls)}
        {polls && openPolls?.length === 0 && closedPolls.length > 0 && (
          <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
            No open polls. Use “New poll” to ask the band something.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <MinimizeToggle
            minimized={membersMinimized}
            onToggle={() => setMembersMinimized((v) => !v)}
            label="Members"
          >
            <h2 className="text-sm font-medium">Members</h2>
          </MinimizeToggle>
          {membersMinimized && (
            <span className="text-xs text-neutral-500">
              <span aria-hidden="true">·</span> {members.length}{' '}
              {members.length === 1 ? 'member' : 'members'}
            </span>
          )}
        </div>
        {!membersMinimized && (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 px-4 py-3 md:py-1.5 md:px-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {m.name ?? m.email ?? 'Unknown'}
                  </div>
                  {m.email && m.name && (
                    <div className="truncate text-xs text-neutral-500">
                      {m.email}
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {closedPolls.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MinimizeToggle
              minimized={closedMinimized}
              onToggle={() => setClosedMinimized((v) => !v)}
              label="Closed polls"
            >
              <h2 className="text-sm font-medium">Closed polls</h2>
            </MinimizeToggle>
            <span className="text-xs text-neutral-500">
              <span aria-hidden="true">·</span> {closedPolls.length}
            </span>
          </div>
          {!closedMinimized && renderPollList(closedPolls)}
        </section>
      )}
    </div>
  );
}
