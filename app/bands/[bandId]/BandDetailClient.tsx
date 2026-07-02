'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ActionMenu, ActionMenuItem } from '../../ActionMenu';
import { ConfirmModal } from '../../ConfirmModal';
import { PickerButton, type PickedFile } from '../../PickerButton';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { formatRelativeTime } from '@/lib/format';

interface Member {
  userId: string;
  email: string | null;
  name: string | null;
  role: 'owner' | 'member';
}

interface BandDetail {
  band: { id: string; name: string };
  members: Member[];
  myRole: 'owner' | 'member';
}

interface Conversation {
  id: string;
  audioFileName: string | null;
  closed: boolean;
  archived: boolean;
  updatedAt: string;
}

interface Setlist {
  id: string;
  name: string;
  updatedAt: string;
  songs: { conversationId: string; audioFileName: string | null }[];
}

/**
 * Band detail: name, read-only member list, and the audio library
 * (add from Drive or a local file). Owners get an "Edit band" link to
 * manage members and delete the band; non-owners get "Leave band".
 */
export function BandDetailClient({
  bandId,
  apiKey,
}: {
  bandId: string;
  apiKey: string;
}) {
  const [data, setData] = useState<BandDetail | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(
    null,
  );
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const trackPending = useTrackPending();
  const router = useRouter();
  const showToast = useToast();

  const load = useCallback(async () => {
    try {
      const [detailRes, convRes, setlistRes] = await Promise.all([
        fetch(`/api/bands/${bandId}`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/conversations`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/setlists`, { cache: 'no-store' }),
      ]);
      if (!detailRes.ok) {
        const b = await detailRes.json().catch(() => ({}));
        throw new Error(b.message ?? b.error ?? `HTTP ${detailRes.status}`);
      }
      setData((await detailRes.json()) as BandDetail);
      if (convRes.ok) {
        const cd = (await convRes.json()) as { conversations: Conversation[] };
        setConversations(cd.conversations);
      }
      if (setlistRes.ok) {
        const sd = (await setlistRes.json()) as { setlists: Setlist[] };
        setSetlists(sd.setlists);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bandId]);

  useEffect(() => {
    void trackPending(() => load());
  }, [load, trackPending]);

  const handleRegister = useCallback(
    async (files: PickedFile[]) => {
      try {
        await trackPending(async () => {
          // Register each picked audio file as a conversation under the band.
          for (const f of files) {
            const r = await fetch(`/api/bands/${bandId}/conversations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                driveAudioFileId: f.id,
                audioFileName: f.name,
              }),
            });
            if (!r.ok) {
              const b = await r.json().catch(() => ({}));
              throw new Error(b.message ?? `HTTP ${r.status}`);
            }
          }
        });
        await load();
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
      }
    },
    [bandId, load, trackPending, showToast],
  );

  const handleLocalAudio = async (file: File) => {
    if (audioBusy) return;
    setAudioBusy(true);
    try {
      await trackPending(async () => {
        const form = new FormData();
        form.append('file', file);
        const r = await fetch(`/api/bands/${bandId}/conversations`, {
          method: 'POST',
          body: form,
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setAudioBusy(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  // Close the source-choice modal on Escape.
  useEffect(() => {
    if (!chooseOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !audioBusy) setChooseOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chooseOpen, audioBusy]);

  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/leave`, { method: 'POST' });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      router.push('/bands');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setLeaveOpen(false);
    } finally {
      setLeaving(false);
    }
  };

  const handleDeleteSong = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/conversations/${deleteTarget.id}`, {
          method: 'DELETE',
        });
        if (!r.ok && r.status !== 204) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      setDeleteTarget(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleArchive = async (c: Conversation) => {
    if (archiving) return;
    setArchiving(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/conversations/${c.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: !c.archived }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setArchiving(false);
    }
  };

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (!data) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const isOwner = data.myRole === 'owner';
  const activeSongs = conversations?.filter((c) => !c.archived) ?? null;
  const archivedSongs = conversations?.filter((c) => c.archived) ?? [];

  const renderSongRow = (c: Conversation) => (
    <li
      key={c.id}
      className="flex items-center gap-2 pr-4 hover:bg-neutral-50 dark:hover:bg-neutral-900"
    >
      <Link href={`/notes/${c.id}`} className="min-w-0 flex-1 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            {c.audioFileName ?? 'Untitled audio'}
          </span>
          {c.closed && (
            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              closed
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-neutral-500">
          Updated {formatRelativeTime(c.updatedAt)}
        </div>
      </Link>
      <ActionMenu label="Song actions" disabled={deleting || archiving}>
        <ActionMenuItem onClick={() => handleToggleArchive(c)}>
          {c.archived ? 'Unarchive song' : 'Archive song'}
        </ActionMenuItem>
        <ActionMenuItem destructive onClick={() => setDeleteTarget(c)}>
          Delete
        </ActionMenuItem>
      </ActionMenu>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {data.band.name}
        </h1>
        {isOwner && (
          <Link
            href={`/bands/${bandId}/edit`}
            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Edit band
          </Link>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Members</h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {data.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
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
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Audio</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/bands/${bandId}/setlists/new`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Create setlist
            </Link>
            <button
              type="button"
              onClick={() => setChooseOpen(true)}
              disabled={audioBusy}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              {audioBusy ? 'Adding…' : 'Add audio'}
            </button>
          </div>
        </div>
        {activeSongs && activeSongs.length === 0 && (
          <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
            No audio yet. Use “Add audio” to add from Drive or your device.
          </p>
        )}
        {activeSongs && activeSongs.length > 0 && (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {activeSongs.map(renderSongRow)}
          </ul>
        )}

        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.oga,.opus,.webm,.flac,.aac"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleLocalAudio(file);
          }}
        />

        {chooseOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="audio-source-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => {
              if (!audioBusy) setChooseOpen(false);
            }}
          >
            <div
              className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="audio-source-title" className="text-base font-semibold">
                Add audio
              </h2>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Choose one or more files from Google Drive, or upload one from
                this device.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <PickerButton
                  apiKey={apiKey}
                  label="Choose from Google Drive"
                  onPick={(files) => {
                    setChooseOpen(false);
                    void handleRegister(files);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setChooseOpen(false);
                    audioInputRef.current?.click();
                  }}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  Upload a local file
                </button>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setChooseOpen(false)}
                  disabled={audioBusy}
                  className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {setlists.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Setlists</h2>
          <ul className="flex flex-col gap-2">
            {setlists.map((sl) => (
              <li
                key={sl.id}
                className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{sl.name}</span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {sl.songs.length}{' '}
                    {sl.songs.length === 1 ? 'song' : 'songs'}
                  </span>
                </div>
                {sl.songs.length > 0 && (
                  <ol className="mt-1 list-decimal pl-5 text-sm text-neutral-600 dark:text-neutral-400">
                    {sl.songs.map((s) => (
                      <li key={s.conversationId} className="truncate">
                        {s.audioFileName ?? 'Untitled audio'}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {archivedSongs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-neutral-500">Archived Audio</h2>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {archivedSongs.map(renderSongRow)}
          </ul>
        </section>
      )}

      {!isOwner && (
        <button
          type="button"
          onClick={() => setLeaveOpen(true)}
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 mt-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          Leave band
        </button>
      )}

      <ConfirmModal
        open={leaveOpen}
        title={`Leave ${data.band.name}?`}
        description="You’ll lose access to this band’s audio and conversations. An owner can add you back later."
        confirmLabel="Leave band"
        busyLabel="Leaving…"
        busy={leaving}
        onConfirm={handleLeave}
        onCancel={() => setLeaveOpen(false)}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.audioFileName ?? 'this song'}?`}
        description="This permanently deletes the song and all of its notes, sheet music, and activity. This can’t be undone."
        confirmLabel="Delete song"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDeleteSong}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
