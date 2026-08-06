'use client';

import { ensureOk, errorMessage } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '../../../ConfirmModal';
import { Modal } from '../../../Modal';
import { useCanUseDrive } from '../../../DriveCapabilityProvider';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { useBeforeUnload } from '../../../useBeforeUnload';
import { BandAudioList } from './BandAudioList';
import { BandSetlistsTab } from './BandSetlistsTab';
import { SongQueue } from './SongQueue';
import { UploadHistory } from './UploadHistory';
import { todayKey } from './uploadDays';
import { AddToSetlistModal } from './AddToSetlistModal';
import { AddAudioSourceModal } from './AddAudioSourceModal';
import { useBandAudioData } from '../bandDetailHooks';
import type { Conversation } from '../bandDetailShared';
import { LoadingBlock } from '../../../Spinner';
import {
  AUDIO_TABS,
  AUDIO_TAB_STORAGE_KEY,
  DEFAULT_AUDIO_TAB,
  TAB_LABELS,
  isAudioTab,
  type AudioTab,
} from './audioTabs';

/**
 * Band Audio coordinator: fetches the band's songs and setlists, owns the
 * audio import / song / add-to-setlist actions and their modals, and renders
 * the Song queue, Songs, Setlists, and Uploads tabs. Previously the band
 * page's Audio tab; now its own page, and the home of Setlists too (they're
 * built out of this page's songs).
 */
export function BandAudioClient({
  bandId,
  apiKey,
  initialTab,
}: {
  bandId: string;
  apiKey: string;
  /** From `?tab=…`; when set it wins over the last tab the user was on. */
  initialTab?: AudioTab;
}) {
  // An explicit ?tab= wins, then the last tab this user left the page on, then
  // Song queue. Reading storage in the initializer (rather than an effect)
  // avoids a flash of the wrong tab; it's hydration-safe because the server
  // render never gets past the loading block below.
  const [activeTab, setActiveTab] = useState<AudioTab>(() => {
    if (initialTab) return initialTab;
    if (typeof window === 'undefined') return DEFAULT_AUDIO_TAB;
    try {
      const saved = localStorage.getItem(AUDIO_TAB_STORAGE_KEY);
      if (isAudioTab(saved)) return saved;
    } catch {
      // ignore unavailable storage
    }
    return DEFAULT_AUDIO_TAB;
  });
  const [chooseOpen, setChooseOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Warn before closing/reloading the tab mid-upload — a real page unload would
  // cut off a local file upload (and roll it back server-side). In-app
  // navigation is unaffected; those uploads finish in the background.
  useBeforeUnload(audioBusy || importProgress !== null);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [addTarget, setAddTarget] = useState<Conversation | null>(null);
  const [selectedSetlists, setSelectedSetlists] = useState<Set<string>>(
    new Set(),
  );
  const [addingToSetlist, setAddingToSetlist] = useState(false);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const trackPending = useTrackPending();
  const router = useRouter();
  const showToast = useToast();
  const canUseDrive = useCanUseDrive();

  const { data, conversations, setlists, uploads, error, reload } =
    useBandAudioData(bandId);

  // Mirror the active tab into the URL (?tab=…) so refresh and browser-back
  // restore it, and remember it so navigating away and back to Audio (a
  // paramless link) returns to the same tab. history.replaceState — no
  // navigation/refetch, and no history entry per tab switch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState(window.history.state, '', url.toString());
    try {
      localStorage.setItem(AUDIO_TAB_STORAGE_KEY, activeTab);
    } catch {
      // ignore unavailable storage
    }
  }, [activeTab]);

  const registerAudio = useCallback(
    async (bodies: Record<string, unknown>[]) => {
      if (bodies.length === 0) return;
      // Register each picked audio file (from Drive or Dropbox) as a
      // conversation. Import each independently so one bad file doesn't abort
      // the rest; report a summary. Sequential to avoid buffering several large
      // downloads at once.
      let added = 0;
      let firstError: string | null = null;
      // For a bulk import, add each file silently and send one batched
      // notification afterwards (a single file keeps its per-file notice).
      const silent = bodies.length > 1;
      setImportProgress({ current: 1, total: bodies.length });
      try {
        await trackPending(async () => {
          for (let i = 0; i < bodies.length; i++) {
            setImportProgress({ current: i + 1, total: bodies.length });
            try {
              const r = await fetch(
                `/api/bands/${bandId}/conversations${silent ? '?silent=1' : ''}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(bodies[i]),
                },
              );
              await ensureOk(r);
              added += 1;
            } catch (e) {
              if (!firstError) {
                firstError = e instanceof Error ? e.message : String(e);
              }
            }
          }
        });
      } finally {
        setImportProgress(null);
      }
      if (silent && added > 0) {
        await fetch(`/api/bands/${bandId}/conversations/notify-added`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: added, day: todayKey() }),
        }).catch(() => {});
      }
      await reload();

      const failed = bodies.length - added;
      if (failed === 0) {
        showToast(`Added ${added} song${added === 1 ? '' : 's'}.`, 'success');
      } else if (added === 0) {
        showToast(firstError ?? 'Could not add the songs.');
      } else {
        showToast(
          `Added ${added} of ${bodies.length}. ${failed} failed: ${firstError}`,
        );
      }
    },
    [bandId, reload, trackPending, showToast],
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
        await ensureOk(r);
      });
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setAudioBusy(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  const handleCreateSong = async () => {
    const name = createName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        await ensureOk(r);
      });
      setCreateOpen(false);
      setCreateName('');
      showToast('Song created.', 'success');
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
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
        await ensureOk(r, [204]);
      });
      setDeleteTarget(null);
      await reload();
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
        await ensureOk(r);
      });
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setArchiving(false);
    }
  };

  const openAddToSetlist = (c: Conversation) => {
    setSelectedSetlists(new Set());
    setAddTarget(c);
  };

  const closeAddToSetlist = () => {
    if (addingToSetlist) return;
    setAddTarget(null);
  };

  const toggleSetlist = (id: string) => {
    setSelectedSetlists((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddToSetlists = async () => {
    if (!addTarget || addingToSetlist || selectedSetlists.size === 0) return;
    const song = addTarget;
    const ids = [...selectedSetlists];
    setAddingToSetlist(true);
    try {
      await trackPending(async () => {
        const results = await Promise.all(
          ids.map((sid) =>
            fetch(`/api/bands/${bandId}/setlists/${sid}/songs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversationId: song.id }),
            }),
          ),
        );
        const bad = results.find((r) => !r.ok);
        if (bad) throw new Error(await errorMessage(bad));
      });
      showToast(
        `Added to ${ids.length} setlist${ids.length === 1 ? '' : 's'}.`,
        'success',
      );
      setAddTarget(null);
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingToSetlist(false);
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
    return <LoadingBlock />;
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="flex items-baseline gap-2">
        <h1 className="title-text">Audio</h1>
      </span>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Audio sections"
        className="flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800"
      >
        {AUDIO_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={
              '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ' +
              (activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent minor-text-theme-colors hover:text-neutral-800 dark:hover:text-neutral-200')
            }
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'queue' && <SongQueue />}

      {activeTab === 'songs' && (
        <BandAudioList
          conversations={conversations}
          bandName={data?.band.name ?? null}
          canUseDrive={canUseDrive}
          importProgress={importProgress}
          audioBusy={audioBusy}
          rowsDisabled={deleting || archiving}
          onOpenChooser={() => setChooseOpen(true)}
          onCreateSong={() => setCreateOpen(true)}
          onAddToSetlist={openAddToSetlist}
          onEditSong={(c) => router.push(`/notes/${c.id}/edit`)}
          onViewSong={(c) => router.push(`/notes/${c.id}`)}
          onToggleArchive={handleToggleArchive}
          onDelete={(c) => setDeleteTarget(c)}
        />
      )}

      {activeTab === 'setlists' && (
        <BandSetlistsTab
          bandId={bandId}
          setlists={setlists}
          onReload={reload}
        />
      )}

      {activeTab === 'uploads' && (
        <UploadHistory bandId={bandId} uploads={uploads} />
      )}

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

      {addTarget && (
        <AddToSetlistModal
          target={addTarget}
          setlists={setlists.filter((s) => !s.archived)}
          selected={selectedSetlists}
          busy={addingToSetlist}
          onToggle={toggleSetlist}
          onCancel={closeAddToSetlist}
          onConfirm={handleAddToSetlists}
        />
      )}

      {/* Kept mounted while the source modal closes so it can trigger it. */}
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

      {createOpen && (
        <Modal
          onClose={() => {
            if (!creating) {
              setCreateOpen(false);
              setCreateName('');
            }
          }}
          labelledBy="create-song-title"
          busy={creating}
        >
          <h2 id="create-song-title" className="text-base font-semibold">
            Create song
          </h2>
          <p className="mt-1 text-sm minor-text-theme-colors">
            Start a song from just a name. You can add audio, sheet music, and
            notes later.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateSong();
            }}
          >
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Song name"
              aria-label="Song name"
              autoFocus
              disabled={creating}
              className="mt-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:minor-text-theme-colors"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateName('');
                }}
                disabled={creating}
                className="btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !createName.trim()}
                className="btn-primary"
              >
                {creating ? 'Creating…' : 'Create song'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {chooseOpen && (
        <AddAudioSourceModal
          canUseDrive={canUseDrive}
          apiKey={apiKey}
          busy={audioBusy}
          onPickDrive={(files) => {
            setChooseOpen(false);
            void registerAudio(
              files.map((f) => ({
                driveAudioFileId: f.id,
                audioFileName: f.name,
              })),
            );
          }}
          onPickDropbox={(files) => {
            setChooseOpen(false);
            void registerAudio(
              files.map((f) => ({
                dropboxUrl: f.link,
                name: f.name,
                bytes: f.bytes,
              })),
            );
          }}
          onUploadLocal={() => {
            setChooseOpen(false);
            audioInputRef.current?.click();
          }}
          onClose={() => setChooseOpen(false)}
        />
      )}
    </div>
  );
}
