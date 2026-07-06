'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';

interface SongOption {
  id: string;
  name: string;
}

/**
 * Build a setlist: name it, then toggle which of the band's songs are in
 * it. "Done" creates the setlist (preserving the band's song order) and
 * returns to the band page.
 */
export function NewSetlistClient({
  bandId,
  songs,
}: {
  bandId: string;
  songs: SongOption[];
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDone = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        // Submit in the displayed (band) order.
        const conversationIds = songs
          .filter((s) => selected.has(s.id))
          .map((s) => s.id);
        const r = await fetch(`/api/bands/${bandId}/setlists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed, conversationIds }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      showToast('Setlist created.', 'success');
      router.push(`/bands/${bandId}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">New setlist</h1>
        <button
          type="button"
          onClick={handleDone}
          disabled={busy || !name.trim()}
          className="shrink-0 rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Done'}
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={255}
        placeholder="Setlist name"
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Songs</h2>
          <span className="text-xs text-neutral-500">
            {selected.size} selected
          </span>
        </div>
        {songs.length === 0 ? (
          <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
            This band has no songs yet. Add audio first.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {songs.map((s) => {
              const isSelected = selected.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={isSelected}
                    className="flex w-full items-center gap-3 px-4 py-3 md:py-1.5 md:px-3 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-neutral-300 text-transparent dark:border-neutral-600'
                      }`}
                    >
                      ✓
                    </span>
                    <span className="truncate font-medium">{s.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
