'use client';

import Link from 'next/link';
import { LoadingBlock } from '../Spinner';
import type { SetlistSongsState } from './useSetlistPracticeSongs';

const MESSAGES: Record<string, { title: string; detail: string }> = {
  missing: {
    title: 'No setlist in this link',
    detail: 'The link looks incomplete. Ask for it again, or pick a setlist.',
  },
  forbidden: {
    title: 'You don’t have access to this setlist',
    detail:
      'It belongs to a band you’re not in. Ask someone in that band to add you.',
  },
  gone: {
    title: 'Setlist not found',
    detail: 'It may have been deleted since this link was shared.',
  },
  offline: {
    title: 'You’re offline',
    detail:
      'This setlist isn’t downloaded on this device, so there’s nothing to show yet.',
  },
};

/**
 * What the Practice/Live screens show before — or instead of — a setlist.
 * These screens are reachable by a shared link, so every way that link can
 * fail needs an answer someone can act on.
 */
export function SetlistScreenState({
  state,
  backHref,
}: {
  state: SetlistSongsState;
  backHref: string;
}) {
  if (state.status === 'loading' || state.status === 'ready') {
    return <LoadingBlock label="Loading setlist" />;
  }

  const { title, detail } = MESSAGES[state.status]!;
  return (
    <div className="mx-4 flex flex-col items-center gap-3 rounded-md border border-neutral-200 px-3 py-10 text-center dark:border-neutral-800">
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm minor-text-theme-colors">{detail}</p>
      {state.status === 'offline' ? (
        // Plain <a>: a client-side navigation fetches from the server, which
        // is exactly what isn't available here.
        <a href="/offline" className="btn-outline">
          See what’s downloaded
        </a>
      ) : (
        <Link href={backHref} className="btn-outline">
          Go back
        </Link>
      )}
    </div>
  );
}
