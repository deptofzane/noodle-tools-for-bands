'use client';

import { ensureOk, errorMessage } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '../../ConfirmModal';
import { type PickedFile } from '../../PickerButton';
import { BandChat } from './BandChat';
import { useCanUseDrive } from '../../DriveCapabilityProvider';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { BandMembersTab } from './BandMembersTab';
import { BandAudioTab } from './BandAudioTab';
import { BandOverviewTab } from './BandOverviewTab';
import { AddToSetlistModal } from './AddToSetlistModal';
import { AddAudioSourceModal } from './AddAudioSourceModal';
import { useBandData, useBandChat } from './bandDetailHooks';
import type { Conversation } from './bandDetailShared';

const BAND_TABS = ['overview', 'chat', 'members', 'audio'] as const;
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
  initialTab = 'overview',
}: {
  bandId: string;
  apiKey: string;
  currentUserId: string;
  initialTab?: BandTab;
}) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
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

  const { data, conversations, setlists, shows, error, reload } =
    useBandData(bandId);
  const { chatChange, unread } = useBandChat(bandId, activeTab);

  // Mirror the active tab into the URL (?tab=…) so browser-back and refresh
  // restore it. Uses history.replaceState — no navigation/refetch, and it
  // doesn't add a history entry per tab switch. Overview stays paramless.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (activeTab === 'overview') url.searchParams.delete('tab');
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

  const handleRegister = useCallback(
    async (files: PickedFile[]) => {
      if (files.length === 0) return;
      // Register each picked audio file as a conversation. Import each one
      // independently so a single bad file doesn't abort the rest; report a
      // summary. Sequential to avoid buffering several large downloads at once.
      let added = 0;
      let firstError: string | null = null;
      setImportProgress({ current: 1, total: files.length });
      try {
        await trackPending(async () => {
          for (let i = 0; i < files.length; i++) {
            const f = files[i]!;
            setImportProgress({ current: i + 1, total: files.length });
            try {
              const r = await fetch(`/api/bands/${bandId}/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  driveAudioFileId: f.id,
                  audioFileName: f.name,
                }),
              });
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
      await reload();

      const failed = files.length - added;
      if (failed === 0) {
        showToast(`Added ${added} song${added === 1 ? '' : 's'}.`, 'success');
      } else if (added === 0) {
        showToast(firstError ?? 'Could not add the songs.');
      } else {
        showToast(
          `Added ${added} of ${files.length}. ${failed} failed: ${firstError}`,
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

  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/leave`, { method: 'POST' });
        await ensureOk(r);
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
        className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
      >
        {BAND_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => changeTab(tab)}
            className={
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium capitalize transition ' +
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

      {activeTab === 'members' && (
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
          onAddToSetlist={openAddToSetlist}
          onEditSong={(c) => router.push(`/notes/${c.id}/edit`)}
          onToggleArchive={handleToggleArchive}
          onDelete={(c) => setDeleteTarget(c)}
        />
      )}

      {activeTab === 'overview' && (
        <BandOverviewTab
          bandId={bandId}
          shows={shows}
          setlists={setlists}
          isOwner={isOwner}
          onLeave={() => setLeaveOpen(true)}
        />
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
          setlists={setlists}
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

      {chooseOpen && (
        <AddAudioSourceModal
          canUseDrive={canUseDrive}
          apiKey={apiKey}
          busy={audioBusy}
          onPickDrive={(files) => {
            setChooseOpen(false);
            void handleRegister(files);
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
