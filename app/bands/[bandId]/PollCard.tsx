'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ensureOk } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';
import { LoadingBlock } from '../../Spinner';

interface FullPoll {
  id: string;
  title: string;
  description: string | null;
  closed: boolean;
  options: { id: string; text: string; votes: number }[];
  totalVotes: number;
  myVote: string | null;
}

/** Read-only result bars (option text, tally, and share of the vote). */
function PollResults({
  options,
  total,
  myVote,
}: {
  options: { id: string; text: string; votes: number }[];
  total: number;
  myVote: string | null;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {options.map((o) => {
        const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
        const mine = o.id === myVote;
        return (
          <li
            key={o.id}
            className={
              'relative overflow-hidden rounded-md border px-3 py-2 ' +
              (mine
                ? 'border-blue-500 dark:border-blue-500'
                : 'border-neutral-200 dark:border-neutral-800')
            }
          >
            <span
              aria-hidden="true"
              className={
                'absolute inset-y-0 left-0 ' +
                (mine
                  ? 'bg-blue-100 dark:bg-blue-950/40'
                  : 'bg-neutral-100 dark:bg-neutral-800/50')
              }
              style={{ width: `${pct}%` }}
            />
            <span className="relative flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium">
                {mine && <span aria-hidden="true">✓ </span>}
                {o.text}
              </span>
              <span className="shrink-0 tabular-nums text-neutral-500">
                {o.votes} · {pct}%
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A poll row in the band's Polls tab. Collapsed by default (title + age);
 * expanding it lazily loads the poll's description and vote results and shows
 * a link through to the full poll page.
 */
export function PollCard({
  bandId,
  id,
  title,
  createdAt,
}: {
  bandId: string;
  id: string;
  title: string;
  createdAt: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [poll, setPoll] = useState<FullPoll | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (!next || poll || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/bands/${bandId}/polls/${id}`, {
        cache: 'no-store',
      });
      await ensureOk(r);
      setPoll((await r.json()) as FullPoll);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 md:py-1.5 md:px-3 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={
              'shrink-0 text-neutral-400 transition-transform ' +
              (expanded ? 'rotate-90' : '')
            }
          >
            ›
          </span>
          <span className="min-w-0 truncate font-medium">{title}</span>
        </span>
        <span className="shrink-0 text-xs text-neutral-500">
          {formatRelativeTime(createdAt)}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 px-4 pb-3 md:px-3 mt-1">
          {loading && <LoadingBlock size="sm" className="py-4" />}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          {poll && (
            <>
              {poll.description && (
                <p className="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                  {poll.description}
                </p>
              )}
              <PollResults
                options={poll.options}
                total={poll.totalVotes}
                myVote={poll.myVote}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.6875rem] text-neutral-500">
                  {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
                </span>
                <Link
                  href={`/bands/${bandId}/polls/${id}`}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  {poll.closed ? 'View poll' : 'Open poll to vote'} →
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
