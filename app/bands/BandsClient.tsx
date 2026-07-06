'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTrackPending } from '../PendingActionProvider';
import { useToast } from '../ToastProvider';

interface BandSummary {
  id: string;
  name: string;
  role: 'owner' | 'member';
  createdAt: string;
}

/**
 * Lists the bands the user belongs to and lets them create a new one.
 * Fetches on mount; refetches after a create. No polling (bands change
 * rarely).
 */
export function BandsClient() {
  const [bands, setBands] = useState<BandSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const trackPending = useTrackPending();
  const showToast = useToast();

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/bands', { cache: 'no-store' });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.message ?? b.error ?? `HTTP ${r.status}`);
      }
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
      await trackPending(async () => {
        const r = await fetch('/api/bands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      setName('');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
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
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
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
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {bands === null && !error && (
        <p className="text-sm text-neutral-500">Loading…</p>
      )}

      {bands && bands.length === 0 && (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
          You’re not in any bands yet. Create one above.
        </p>
      )}

      {bands && bands.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {bands.map((band) => (
            <li key={band.id}>
              <Link
                href={`/bands/${band.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 md:py-1.5 md:px-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="truncate font-medium">{band.name}</span>
                <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {band.role}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
