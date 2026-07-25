'use client';

import { ensureOk } from '@/lib/api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTrackPending } from '../../../../../PendingActionProvider';
import { useToast } from '../../../../../ToastProvider';
import { SetlistItemsEditor, type SetlistItem } from '../../SetlistItemsEditor';
import { useCanGoBack } from '@/app/NavigationHistoryProvider';

interface BandSong {
  conversationId: string;
  name: string;
}

/**
 * Edit a setlist's items: add songs, set breaks, or custom markers; remove
 * and reorder (drag-and-drop). All edits are local until Save, which PATCHes
 * the full item list; Cancel discards them. The item list / add flow lives in
 * the shared SetlistItemsEditor.
 */
export function EditSetlistClient({
  bandId,
  setlistId,
  name,
  initialSongs,
  bandSongs,
}: {
  bandId: string;
  setlistId: string;
  name: string;
  initialSongs: SetlistItem[];
  /** All the band's unarchived songs — the pool to add from. */
  bandSongs: BandSong[];
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const canGoBack = useCanGoBack();

  const [items, setItems] = useState<SetlistItem[]>(initialSongs);
  const [saving, setSaving] = useState(false);

  const viewHref = `/bands/${bandId}/setlists/${setlistId}`;
  // Compare by content (song id or marker label), so add/remove/reorder/rename
  // all count — but the row id (which changes on save) doesn't.
  const serialize = (list: SetlistItem[]) =>
    list.map((s) => s.conversationId ?? `marker:${s.name}`).join('|');
  const dirty = serialize(initialSongs) !== serialize(items);

  // Return to the page the user came from (in-app history), falling back to
  // the song itself on a fresh load / deep link.
  const leave = () => {
    if (canGoBack()) router.back();
    else router.push(viewHref);
  };

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/setlists/${setlistId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map((s) => ({
              conversationId: s.conversationId,
              label: s.conversationId ? null : s.name,
            })),
          }),
        });
        await ensureOk(r);
      });
      showToast('Setlist saved.', 'success');
      router.push(viewHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 mt-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={leave} className="btn-outline">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="btn-primary"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <h1 className="title-text">{name}</h1>

      <SetlistItemsEditor
        items={items}
        onItemsChange={setItems}
        songPool={bandSongs}
        emptyText="Nothing in this setlist yet. Add songs, a set break, or something custom."
        hint="Drag the handle to reorder (or focus it and use the arrow keys); remove an item with ✕."
      />
    </div>
  );
}
