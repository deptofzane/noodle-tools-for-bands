'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { ActionMenu, ActionMenuItem } from '../../../ActionMenu';
import { ConfirmModal } from '../../../ConfirmModal';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { PlayerProvider } from '../../../notes/[conversationId]/PlayerContext';
import { AudioPlayer } from '../../../notes/[conversationId]/AudioPlayer';

interface SongItem {
  id: string;
  conversationId: string | null;
  name: string;
  songLength: number | null;
}

/**
 * The event's setlist songs, each (real songs, not set-break markers) with a
 * kebab to view/edit the song or remove it from the setlist. Removal PATCHes
 * the setlist to its remaining items, then refreshes. Kebab shows only for
 * band members (`canManage`) — songs and edits require band access.
 */
export function EventSetlistSongs({
  bandId,
  setlistId,
  canManage,
  songs,
}: {
  bandId: string;
  setlistId: string;
  canManage: boolean;
  songs: SongItem[];
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [removeTarget, setRemoveTarget] = useState<SongItem | null>(null);
  const [removing, setRemoving] = useState(false);
  // Songs whose audio player is expanded. The player mounts (and only then
  // fetches audio) on expand, and unmounts (stopping playback) on collapse.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const togglePlayer = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleRemove = async () => {
    if (!removeTarget || removing) return;
    setRemoving(true);
    try {
      await trackPending(async () => {
        // Resend the setlist's items minus the removed song, in order.
        const items = songs
          .filter((s) => s.id !== removeTarget.id)
          .map((s) =>
            s.conversationId
              ? { conversationId: s.conversationId }
              : { label: s.name },
          );
        const r = await fetch(`/api/bands/${bandId}/setlists/${setlistId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });
        await ensureOk(r);
      });
      showToast('Song removed from setlist.', 'success');
      setRemoveTarget(null);
      router.refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(false);
    }
  };

  if (songs.length === 0) {
    return (
      <p className="text-sm text-neutral-500">This setlist has no songs.</p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-1 text-sm">
        {songs.map((s) =>
          s.conversationId ? (
            <li key={s.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => togglePlayer(s.id)}
                  aria-expanded={expanded.has(s.id)}
                  aria-label={
                    expanded.has(s.id)
                      ? 'Hide audio player'
                      : 'Show audio player'
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-neutral-400"
                  >
                    {expanded.has(s.id) ? '▾' : '▸'}
                  </span>
                  <span className="min-w-0 truncate">
                    {s.name}
                    {s.songLength != null && (
                      <span className="text-neutral-400">
                        {` - ${formatDuration(s.songLength)}`}
                      </span>
                    )}
                  </span>
                </button>
                {canManage && (
                  <ActionMenu label="Song actions">
                    <ActionMenuItem
                      onClick={() => router.push(`/notes/${s.conversationId}`)}
                    >
                      View song
                    </ActionMenuItem>
                    <ActionMenuItem
                      onClick={() =>
                        router.push(`/notes/${s.conversationId}/edit`)
                      }
                    >
                      Edit song
                    </ActionMenuItem>
                    <ActionMenuItem
                      destructive
                      onClick={() => setRemoveTarget(s)}
                    >
                      Remove song from setlist
                    </ActionMenuItem>
                  </ActionMenu>
                )}
              </div>

              {expanded.has(s.id) && (
                <PlayerProvider key={s.conversationId}>
                  <AudioPlayer
                    src={`/api/conversations/${s.conversationId}/files/audio?name=${encodeURIComponent(
                      s.name,
                    )}`}
                    fileName={s.name}
                    mimeType="audio/mpeg"
                  />
                </PlayerProvider>
              )}
            </li>
          ) : (
            <li
              key={s.id}
              className="text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              {s.name}
            </li>
          ),
        )}
      </ul>

      <ConfirmModal
        open={removeTarget !== null}
        title="Remove song?"
        description={`Remove “${removeTarget?.name ?? ''}” from this setlist? You can add it back later.`}
        confirmLabel="Remove song"
        busyLabel="Removing…"
        busy={removing}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  );
}
