'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '@/lib/format';
import type { ThreadedNote, ApiNote } from '@/lib/db/notes';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { ConfirmModal } from '../../ConfirmModal';
import { usePlayer } from './PlayerContext';
import { NoteForm, type Mentionable } from './NoteForm';
import { Linkify } from './Linkify';

/**
 * One top-level note — header, body, replies, and actions (seek, reply,
 * edit, delete, resolve, copy-link). Talks to the Postgres conversation
 * API. Edit/delete are shown only for notes the user authored
 * (`note.isMine`, set by the server, which also enforces it).
 */

interface NoteItemProps {
  note: ThreadedNote;
  conversationId: string;
  onMutated: () => void;
  highlighted?: boolean;
  mentionables?: Mentionable[];
  mentionLabels?: string[];
}

export function NoteItem({
  note,
  conversationId,
  onMutated,
  highlighted = false,
  mentionables = [],
  mentionLabels = [],
}: NoteItemProps) {
  const player = usePlayer();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const liRef = useRef<HTMLLIElement>(null);
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHighlight, setShowHighlight] = useState(highlighted);
  const [isMinimized, setIsMinimized] = useState<boolean>(
    Boolean(note.resolved) && !highlighted,
  );
  const [isResolving, setIsResolving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const seekToNote = () => player.seek(note.timestampMs / 1000);

  const replyCount = note.replies.length;
  const replyLabel = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
  const isResolved = Boolean(note.resolved);

  useEffect(() => {
    if (!highlighted) return;
    liRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    player.seek(note.timestampMs / 1000);
    const t = setTimeout(() => setShowHighlight(false), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/notes/${conversationId}/practice?thread=${note.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy link to this thread:', url);
    }
  };

  const handleToggleResolved = async () => {
    if (isResolving) return;
    setIsResolving(true);
    try {
      await trackPending(async () => {
        const res = await fetch(
          `/api/conversations/${conversationId}/notes/${note.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolved: !isResolved }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? `HTTP ${res.status}`);
        }
      });
      onMutated();
    } catch (err) {
      showToast(
        `Failed to ${isResolved ? 'reopen' : 'resolve'} thread: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setIsResolving(false);
    }
  };

  const handleEdit = async (body: string) => {
    await trackPending(async () => {
      const res = await fetch(
        `/api/conversations/${conversationId}/notes/${note.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
    });
    setIsEditing(false);
    onMutated();
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await trackPending(() =>
        fetch(`/api/conversations/${conversationId}/notes/${note.id}`, {
          method: 'DELETE',
        }),
      );
      if (res.ok || res.status === 204) onMutated();
      else showToast('Failed to delete note.');
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const handleReply = async (body: string, mentions: string[]) => {
    await trackPending(async () => {
      const res = await fetch(
        `/api/conversations/${conversationId}/notes/${note.id}/replies`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body, mentions }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
    });
    setIsReplying(false);
    onMutated();
  };

  return (
    <li
      ref={liRef}
      className={`rounded-lg border p-3 transition-colors duration-700 ${
        showHighlight
          ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300 dark:border-blue-500 dark:bg-blue-950/40 dark:ring-blue-700'
          : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2 items-center">
        <span className="flex flex-row gap-2 items-center">
          <button
            type="button"
            onClick={() => setIsMinimized((v) => !v)}
            aria-label={isMinimized ? 'Expand thread' : 'Minimize thread'}
            aria-expanded={!isMinimized}
            title={isMinimized ? 'Expand thread' : 'Minimize thread'}
            className="-mr-1 px-2 py-2 text-xl leading-none text-neutral-400 hover:text-fg-body"
          >
            <span aria-hidden="true">{isMinimized ? '▸' : '▾'}</span>
          </button>
          <AuthorTag note={note} />
          {isResolved && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Resolved
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={seekToNote}
          className="font-mono text-xs font-medium text-accent tabular-nums hover:underline"
          title="Jump to this timestamp"
        >
          {formatDuration(note.timestampMs / 1000)}
        </button>
      </div>
      <div className="flex flex-row gap-2 py-2 justify-between">
        {note.isMine && (
          <button
            type="button"
            onClick={handleToggleResolved}
            disabled={isResolving}
            className="text-xs minor-text-theme-colors sm:hover:text-neutral-900 disabled:opacity-50 sm:dark:hover:text-neutral-100"
          >
            {isResolved ? 'Reopen thread' : 'Resolve thread'}
          </button>
        )}
        {replyCount > 0 && (
          <span className="text-xs minor-text-theme-colors">
            <span aria-hidden="true">·</span> {replyLabel}
          </span>
        )}
      </div>

      {!isMinimized && (
        <>
          {isEditing ? (
            <div className="mt-2">
              <NoteForm
                initialBody={note.body}
                onSubmit={handleEdit}
                onCancel={() => setIsEditing(false)}
                submitLabel="Save"
              />
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-snug">
              <Linkify text={note.body} mentionLabels={mentionLabels} />
            </p>
          )}

          {!isEditing && (
            <div className="mt-2 flex items-center gap-2 text-xs minor-text-theme-colors">
              <button
                type="button"
                onClick={() => setIsReplying((v) => !v)}
                className="hover:text-fg py-2 pr-2 md:p-0"
              >
                Reply
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="hover:text-fg p-2 md:p-0"
                title="Copy a link to this thread"
              >
                {copied ? 'Link copied' : 'Copy link'}
              </button>
              {note.isMine && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="hover:text-fg p-2 md:p-0"
                  >
                    Edit
                  </button>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="hover:text-danger p-2 md:p-0"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}

          {isReplying && (
            <div className="mt-3 rounded-md border border-line bg-surface-soft p-2">
              <NoteForm
                placeholder="Write a reply… Use @ to tag someone."
                submitLabel="Reply"
                onSubmit={handleReply}
                onCancel={() => setIsReplying(false)}
                mentionables={mentionables}
              />
            </div>
          )}

          {replyCount > 0 && (
            <ul className="mt-3 space-y-3 border-l-2 border-line pl-3">
              {note.replies.map((reply) => (
                <ReplyItem
                  key={reply.id}
                  reply={reply}
                  conversationId={conversationId}
                  onMutated={onMutated}
                  mentionLabels={mentionLabels}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmDeleteOpen}
        title="Delete thread?"
        description="This deletes the note and all of its replies. This can’t be undone."
        confirmLabel="Delete thread"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </li>
  );
}

function ReplyItem({
  reply,
  conversationId,
  onMutated,
  mentionLabels = [],
}: {
  reply: ThreadedNote;
  conversationId: string;
  onMutated: () => void;
  mentionLabels?: string[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const showToast = useToast();

  const handleEdit = async (body: string) => {
    const res = await fetch(
      `/api/conversations/${conversationId}/notes/${reply.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    setIsEditing(false);
    onMutated();
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/notes/${reply.id}`,
        { method: 'DELETE' },
      );
      if (res.ok || res.status === 204) onMutated();
      else showToast('Failed to delete reply.');
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  return (
    <li>
      <div className="flex items-center gap-2">
        <AuthorTag note={reply} />
      </div>
      {isEditing ? (
        <div className="mt-1">
          <NoteForm
            initialBody={reply.body}
            onSubmit={handleEdit}
            onCancel={() => setIsEditing(false)}
            submitLabel="Save"
          />
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">
          <Linkify text={reply.body} mentionLabels={mentionLabels} />
        </p>
      )}
      {reply.isMine && !isEditing && (
        <div className="mt-1 flex items-center gap-2 text-xs minor-text-theme-colors">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="hover:text-fg"
          >
            Edit
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="hover:text-danger"
          >
            Delete
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmDeleteOpen}
        title="Delete reply?"
        description="This can’t be undone."
        confirmLabel="Delete reply"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </li>
  );
}

function AuthorTag({ note }: { note: ApiNote }) {
  const displayName = note.author?.name ?? note.author?.email ?? 'Someone';
  return (
    <span className="text-xs text-fg-muted" title={note.author?.email ?? ''}>
      {displayName}
      {note.isMine && (
        <span className="ml-1 rounded bg-accent-fill-strong px-1 py-0.5 text-[0.625rem] font-medium text-accent-strong">
          you
        </span>
      )}
    </span>
  );
}
