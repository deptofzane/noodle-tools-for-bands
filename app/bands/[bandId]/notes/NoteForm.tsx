'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { AutoTextarea } from '../../../AutoTextarea';
import { PageHeader } from '../../../PageHeader';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { NoteLinkModal } from './NoteLinkModal';
import { Modal } from '@/app/Modal';
import { noteLinkBadge } from '@/lib/note-links';
import type { NoteLinkInput } from '@/lib/db/user-notes';

const field =
  'rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

/**
 * The New note / Edit note screen. One component for both: `noteId` decides
 * whether saving POSTs or PATCHes, which keeps the two forms from drifting.
 *
 * Links are edited entirely client-side and submitted with the note, so
 * adding three and then cancelling leaves nothing behind.
 */
export function NoteForm({
  bandId,
  bandName,
  noteId,
  initial,
}: {
  bandId: string;
  bandName: string;
  /** Omitted when creating. */
  noteId?: string;
  initial?: {
    title: string;
    body: string;
    shared: boolean;
    pinned: boolean;
    links: NoteLinkInput[];
  };
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [shared, setShared] = useState(initial?.shared ?? false);
  const [links, setLinks] = useState<NoteLinkInput[]>(initial?.links ?? []);
  const [linkOpen, setLinkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /*
   * Asked when a note that's pinned privately is about to become shared.
   *
   * A private pin is nobody's business but the author's, and it was never
   * announced. Sharing would silently put it at the top of the band's list
   * and tell everyone — so the decision to carry it across is taken here,
   * deliberately, rather than inherited.
   */
  const [confirmPin, setConfirmPin] = useState(false);
  const pinned = initial?.pinned ?? false;
  /*
   * What sharing and pinning looked like as of the last successful save.
   *
   * `initial` is a prop and never changes, which was fine while every save
   * left the page. "Save without closing" means the same form can be saved
   * repeatedly, and comparing against `initial` would re-ask the pin question
   * on every save after the first.
   */
  const [savedShared, setSavedShared] = useState(initial?.shared ?? false);
  const [savedPinned, setSavedPinned] = useState(pinned);
  /** Whether the save now in flight should leave the page when it lands. */
  const [closeOnSave, setCloseOnSave] = useState(true);
  const becomingShared =
    Boolean(noteId) && savedPinned && !savedShared && shared;

  const backHref = `/bands/${bandId}?tab=notes`;
  const canSave = Boolean(title.trim() && !busy);

  const save = async (keepPinned?: boolean, close = true) => {
    if (!canSave) return;
    // Ask before a private pin becomes a public one; the answer comes back
    // through this same function as `keepPinned`. The modal's buttons carry
    // the caller's intent so answering it doesn't close a page the user asked
    // to keep open.
    if (becomingShared && keepPinned === undefined) {
      setCloseOnSave(close);
      setConfirmPin(true);
      return;
    }
    setConfirmPin(false);
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(
          noteId
            ? `/api/bands/${bandId}/notes/${noteId}`
            : `/api/bands/${bandId}/notes`,
          {
            method: noteId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(),
              body,
              shared,
              links,
              // Only sent when the question was actually asked, so an
              // ordinary save never disturbs an existing pin.
              ...(keepPinned === undefined ? {} : { pinned: keepPinned }),
            }),
          },
        );
        await ensureOk(res, [200, 201]);
      });
      showToast(noteId ? 'Note saved.' : 'Note created.', 'success');
      setSavedShared(shared);
      if (keepPinned !== undefined) setSavedPinned(keepPinned);
      if (close) {
        router.push(backHref);
        return;
      }
      setBusy(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader defaultHref={backHref} defaultHrefName="Notes" />

      <div className="flex items-center justify-between gap-2">
        <h1 className="title-text">{noteId ? 'Edit note' : 'New note'}</h1>
        <span className="flex shrink-0 items-center gap-2">
          {/* Editing only: on a new note this would have to create the note
              and then switch the form over to editing it, which is a
              different thing from what this button does. */}
          {noteId && (
            <button
              type="button"
              onClick={() => void save(undefined, false)}
              disabled={!canSave}
              className="btn-outline"
            >
              Save without closing
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="btn-primary"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </span>
      </div>

      <p className="text-sm minor-text-theme-colors">{bandName}</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="note-title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="note-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          autoFocus={!noteId}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="note-body" className="text-sm font-medium">
          Note
        </label>
        <AutoTextarea
          id="note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${field} min-h-40`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Links</span>
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="btn-outline"
          >
            New link
          </button>
        </div>
        {links.length === 0 ? (
          <p className="text-[0.6875rem] minor-text-theme-colors">
            Optional — point this note at a song, event, venue, setlist, poll,
            or anything else.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {links.map((l, i) => (
              <li
                key={`${l.kind}-${l.targetId ?? l.url}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded bg-fill-muted px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide minor-text-theme-colors">
                    {noteLinkBadge(l)}
                  </span>
                  <span className="truncate">{l.label}</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setLinks((prev) => prev.filter((_, j) => j !== i))
                  }
                  aria-label={`Remove link to ${l.label}`}
                  className="shrink-0 text-neutral-400 hover:text-fg-body"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex items-start gap-3 rounded-md border border-line px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={shared}
          onChange={(e) => setShared(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-medium">Make visible to band</span>
          <span className="block text-[0.6875rem] minor-text-theme-colors">
            Off by default — only you can see this note. Sharing lets the band
            read it; editing and deleting stay with you.
          </span>
        </span>
      </label>

      {/*
        Three outcomes, not two, so this can't be a ConfirmModal: keeping the
        pin, dropping it, and changing your mind are all distinct. Mapping
        "share without the pin" onto cancel would mean Escape or a backdrop
        click quietly saved the note — dismissing has to mean *abort*.
      */}
      {confirmPin && (
        <Modal
          onClose={() => setConfirmPin(false)}
          labelledBy="keep-pin-title"
          size="sm"
        >
          <h2 id="keep-pin-title" className="text-base font-semibold">
            Keep this note pinned?
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            “{title.trim()}” is pinned to the top of your own notes. Sharing it
            pins it to the top of the band’s shared notes too, and everyone will
            be told you pinned it.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void save(true, closeOnSave)}
              className="btn-primary"
            >
              Keep it pinned
            </button>
            <button
              type="button"
              onClick={() => void save(false, closeOnSave)}
              className="btn-outline"
            >
              Share without pinning
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setConfirmPin(false)}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {linkOpen && (
        <NoteLinkModal
          bandId={bandId}
          onAdd={(link) => {
            setLinks((prev) => [...prev, link]);
            setLinkOpen(false);
          }}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </div>
  );
}
