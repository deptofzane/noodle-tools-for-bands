'use client';

import { useState } from 'react';
import { ensureOk } from '@/lib/api';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';

interface Opt {
  id: string;
  text: string;
  votes: number;
}

/**
 * Poll voting UI: each option is a button showing a result bar and its tally;
 * tapping casts (or changes) the member's vote. State is refreshed from the
 * server's returned tallies after each vote. When `closed`, the poll is
 * archived: options render as read-only result bars and no vote is sent.
 */
export function PollVote({
  bandId,
  pollId,
  initialOptions,
  initialTotal,
  initialMyVote,
  closed: initialClosed = false,
}: {
  bandId: string;
  pollId: string;
  initialOptions: Opt[];
  initialTotal: number;
  initialMyVote: string | null;
  closed?: boolean;
}) {
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [options, setOptions] = useState(initialOptions);
  const [total, setTotal] = useState(initialTotal);
  const [myVote, setMyVote] = useState(initialMyVote);
  const [closed, setClosed] = useState(initialClosed);
  const [busy, setBusy] = useState(false);

  const vote = async (optionId: string) => {
    if (closed || busy || optionId === myVote) return;
    setBusy(true);
    try {
      const data = await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/polls/${pollId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId }),
        });
        await ensureOk(r);
        return (await r.json()) as {
          options: { id: string; votes: number }[];
          total: number;
          myVote: string | null;
          closed: boolean;
        };
      });
      setOptions((prev) =>
        prev.map((o) => ({
          ...o,
          votes: data.options.find((x) => x.id === o.id)?.votes ?? o.votes,
        })),
      );
      setTotal(data.total);
      setMyVote(data.myVote);
      if (data.closed && !closed) {
        setClosed(true);
        showToast('Everyone voted — the poll closed automatically.', 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {options.map((o) => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          const mine = o.id === myVote;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => vote(o.id)}
                disabled={busy || closed}
                aria-pressed={mine}
                className={
                  'relative w-full overflow-hidden rounded-lg border px-4 py-3 text-left transition disabled:cursor-default ' +
                  (mine
                    ? 'border-blue-500 dark:border-blue-500'
                    : 'border-neutral-200 dark:border-neutral-800 ' +
                      (closed
                        ? ''
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'))
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    'absolute inset-y-0 left-0 transition-[width] ' +
                    (mine
                      ? 'bg-blue-100 dark:bg-blue-950/40'
                      : 'bg-neutral-100 dark:bg-neutral-800/50')
                  }
                  style={{ width: `${pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    {mine && <span aria-hidden="true">✓ </span>}
                    {o.text}
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-500">
                    {o.votes} · {pct}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutral-500">
        {total} {total === 1 ? 'vote' : 'votes'}
        {closed ? ' · final results' : myVote ? '' : ' · tap an option to vote'}
      </p>
    </div>
  );
}
