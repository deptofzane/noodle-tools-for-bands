'use client';

import { ensureOk, errorMessage } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '../../ConfirmModal';
import { Modal } from '../../Modal';
import { BandChat } from './BandChat';
import { useCanUseDrive } from '../../DriveCapabilityProvider';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { useBeforeUnload } from '../../useBeforeUnload';
import { BandMembersTab } from './BandMembersTab';
import { BandAudioTab } from './BandAudioTab';
import { BandOverviewTab } from './BandOverviewTab';
import { BandSetlistsTab } from './BandSetlistsTab';
import { BandVenuesTab } from './BandVenuesTab';
import { AddToSetlistModal } from './AddToSetlistModal';
import { AddAudioSourceModal } from './AddAudioSourceModal';
import { useBandData, useBandChat } from './bandDetailHooks';
import type { Conversation } from './bandDetailShared';

const BAND_TABS = [
  'chat',
  'events',
  'setlists',
  'venues',
  'audio',
  'polls',
] as const;
type BandTab = (typeof BAND_TABS)[number];
const ACTIVE_TAB_KEY = 'bandActiveTab';

/**
 * Band detail coordinator: fetches the band's data, owns the audio / song /
 * setlist / leave actions and the tab state, and renders the tab bar plus the
 * active tab (Overview / Chat / Members / Audio) and the shared modals. The
 * tab bodies live in their own components.
 */
export function BandDetailClient({
  bandId,
  apiKey,
  currentUserId,
  initialTab = 'chat',
}: {
  bandId: string;
  apiKey: string;
  currentUserId: string;
  initialTab?: BandTab;
}) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
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
  const [activeTab, setActiveTab] = useState<BandTab>(initialTab);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const trackPending = useTrackPending();
  const router = useRouter();
  const showToast = useToast();
  const canUseDrive = useCanUseDrive();

  const { data, conversations, setlists, shows, venues, error, reload } =
    useBandData(bandId);
  const { chatChange, unread } = useBandChat(bandId, activeTab);

  // Mirror the active tab into the URL (?tab=…) so browser-back and refresh
  // restore it. Uses history.replaceState — no navigation/refetch, and it
  // doesn't add a history entry per tab switch. Overview stays paramless.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (activeTab === 'events') url.searchParams.delete('tab');
    else url.searchParams.set('tab', activeTab);
    window.history.replaceState(window.history.state, '', url.toString());
  }, [activeTab]);

  // Persist the chosen tab so it's restored on a later visit.
  const changeTab = useCallback((tab: BandTab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, tab);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, []);

  // On a fresh nav to /bands/[id] (no ?tab=), restore the last-used tab. An
  // explicit ?tab= (deep link / back-nav) always wins and is remembered.
  useEffect(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    const isTab = (v: string | null): v is BandTab =>
      v !== null && (BAND_TABS as readonly string[]).includes(v);
    try {
      if (urlTab) {
        if (isTab(urlTab)) localStorage.setItem(ACTIVE_TAB_KEY, urlTab);
        return;
      }
      const saved = localStorage.getItem(ACTIVE_TAB_KEY);
      if (isTab(saved)) setActiveTab(saved);
    } catch {
      // ignore
    }
  }, []);

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
          body: JSON.stringify({ count: added }),
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

  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/leave`, { method: 'POST' });
        await ensureOk(r);
      });
      // Refresh the header's band picker (it's mounted separately).
      window.dispatchEvent(new Event('bands:changed'));
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
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const isOwner = data.myRole === 'owner';

  return (
    <div className="flex flex-col gap-4">
      <span className="flex items-center justify-between gap-2">
        <h1 className="title-text">{data.band.name}</h1>
        {isOwner && (
          <Link
            href={`/bands/${bandId}/edit`}
            className="shrink-0 btn-outline"
          >
            Edit band
          </Link>
        )}
      </span>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Band sections"
        className="flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800"
      >
        {BAND_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => changeTab(tab)}
            className={
              '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium capitalize transition ' +
              (activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200')
            }
          >
            {tab}
            {tab === 'chat' && activeTab !== 'chat' && unread.count > 0 && (
              <span
                aria-label={`${unread.count} unread${unread.mentioned ? ', mentioned' : ''}`}
                className={
                  'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white ' +
                  (unread.mentioned ? 'bg-red-600' : 'bg-blue-600')
                }
              >
                {unread.mentioned && <span aria-hidden="true">@</span>}
                {unread.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'chat' && (
        <BandChat
          bandId={bandId}
          currentUserId={currentUserId}
          canModerate={isOwner}
          changeSignal={chatChange}
          mentionables={data.members.map((m) => ({
            id: m.userId,
            name: m.name,
            email: m.email,
          }))}
        />
      )}

      {activeTab === 'polls' && (
        <BandMembersTab bandId={bandId} members={data.members} />
      )}

      {activeTab === 'audio' && (
        <BandAudioTab
          conversations={conversations}
          canUseDrive={canUseDrive}
          importProgress={importProgress}
          audioBusy={audioBusy}
          rowsDisabled={deleting || archiving}
          onOpenChooser={() => setChooseOpen(true)}
          onCreateSong={() => setCreateOpen(true)}
          onAddToSetlist={openAddToSetlist}
          onEditSong={(c) => router.push(`/notes/${c.id}/edit`)}
          onToggleArchive={handleToggleArchive}
          onDelete={(c) => setDeleteTarget(c)}
        />
      )}

      {activeTab === 'events' && (
        <BandOverviewTab
          bandId={bandId}
          shows={shows}
          setlists={setlists}
          isOwner={isOwner}
          onLeave={() => setLeaveOpen(true)}
          onReload={reload}
        />
      )}

      {activeTab === 'setlists' && (
        <BandSetlistsTab
          bandId={bandId}
          setlists={setlists}
          onReload={reload}
        />
      )}

      {activeTab === 'venues' && (
        <BandVenuesTab bandId={bandId} venues={venues} onReload={reload} />
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

      {/* Hidden input persists across tabs so the chooser can trigger it. */}
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
          <p className="mt-1 text-sm text-neutral-500">
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
              className="mt-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:placeholder:text-neutral-500"
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
