'use client';

import { ensureOk } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useNavigate } from '../useNavigate';
import { useTrackPending } from '../PendingActionProvider';
import { useToast } from '../ToastProvider';
import { ActionMenu, ActionMenuItem } from '../ActionMenu';
import { LeaveBandModal } from './LeaveBandModal';
import { LoadingBlock } from '../Spinner';
import { DEFAULT_BAND_TAB } from './[bandId]/bandTabs';

interface BandSummary {
  id: string;
  name: string;
  role: 'owner' | 'member';
  createdAt: string;
}

/**
 * Lists the bands the user belongs to and lets them create a new one.
 * Fetches on mount; creating one navigates straight into it, so there's
 * nothing to refetch. No polling (bands change rarely).
 */
export function BandsClient({ currentUserId }: { currentUserId: string }) {
  const [bands, setBands] = useState<BandSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<BandSummary | null>(null);
  const trackPending = useTrackPending();
  const showToast = useToast();
  const go = useNavigate();

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/bands', { cache: 'no-store' });
      await ensureOk(r);
      const data = (await r.json()) as { bands: BandSummary[] };
      setBands(data.bands);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void trackPending(() => load());
  }, [load, trackPending]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const band = await trackPending(async () => {
        const r = await fetch('/api/bands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        });
        await ensureOk(r);
        const data = (await r.json()) as { band: { id: string } };
        return data.band;
      });
      setName('');
      // Let the header's band picker refresh (it's mounted separately).
      window.dispatchEvent(new Event('bands:changed'));
      // Straight into the new band rather than back to the list — there's
      // nothing to do with a band from here, and everything to do inside it.
      // The tab is explicit so it opens on Overview rather than wherever the
      // user last was in some other band.
      go(`/bands/${band.id}?tab=${DEFAULT_BAND_TAB}`);
      // `creating` stays true: the button should remain disabled through the
      // navigation instead of inviting a second band.
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New band name"
          maxLength={100}
          className="flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!name.trim() || creating}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create band'}
        </button>
      </form>

      {error && (
        <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
          {error}
        </p>
      )}

      {bands === null && !error && <LoadingBlock />}

      {bands && bands.length === 0 && (
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
          You’re not in any bands yet. Create one above.
        </p>
      )}

      {bands && bands.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {bands.map((band) => (
            <li
              key={band.id}
              className="flex items-center gap-2 pr-2 hover:bg-surface-soft"
            >
              <Link
                href={`/bands/${band.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 md:py-1.5 md:px-3 text-sm"
              >
                <span className="truncate font-medium">{band.name}</span>
                <span className="shrink-0 rounded bg-fill-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-fg-dim">
                  {band.role}
                </span>
              </Link>
              <ActionMenu label="Band actions">
                <ActionMenuItem onClick={() => go(`/bands/${band.id}`)}>
                  View band
                </ActionMenuItem>
                {band.role === 'owner' && (
                  <ActionMenuItem onClick={() => go(`/bands/${band.id}/edit`)}>
                    Edit band
                  </ActionMenuItem>
                )}
                <ActionMenuItem
                  destructive
                  onClick={() => setLeaveTarget(band)}
                >
                  Leave band
                </ActionMenuItem>
              </ActionMenu>
            </li>
          ))}
        </ul>
      )}

      {leaveTarget && (
        <LeaveBandModal
          band={leaveTarget}
          currentUserId={currentUserId}
          onCancel={() => setLeaveTarget(null)}
          onLeft={() => {
            setLeaveTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
