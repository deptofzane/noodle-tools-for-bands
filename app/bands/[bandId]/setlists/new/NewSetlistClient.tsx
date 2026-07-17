'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';
import { SetlistItemsEditor, type SetlistItem } from '../SetlistItemsEditor';

interface SongOption {
  id: string;
  name: string;
}

/**
 * Build a setlist: name it, then add songs, set breaks, or custom markers,
 * reordering (drag-and-drop) as needed. "Done" creates the setlist and
 * returns to the band page. The item list / add flow lives in the shared
 * SetlistItemsEditor.
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
  const [items, setItems] = useState<SetlistItem[]>([]);
  const [busy, setBusy] = useState(false);

  const songPool = songs.map((s) => ({ conversationId: s.id, name: s.name }));

  const handleDone = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/setlists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed,
            items: items.map((s) => ({
              conversationId: s.conversationId,
              label: s.conversationId ? null : s.name,
            })),
          }),
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
        <h1 className="title-text">New setlist</h1>
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

      <SetlistItemsEditor
        items={items}
        onItemsChange={setItems}
        songPool={songPool}
        emptyText={
          songs.length === 0
            ? 'This band has no songs yet — you can still add set breaks or custom items.'
            : 'Nothing added yet. Add songs, a set break, or something custom.'
        }
      />
    </div>
  );
}
