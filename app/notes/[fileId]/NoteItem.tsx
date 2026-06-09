'use client';

import { useState } from 'react';
import { formatDuration } from '@/lib/audio';
import type { ThreadedNote, ApiNote } from '@/lib/notes';
import { useTrackPending } from '../../PendingActionProvider';
import { usePlayer } from './PlayerContext';
import { NoteForm } from './NoteForm';

/**
 * One top-level note in the panel — header, body, replies, and the
 * action affordances (seek, reply, edit, delete).
 *
 * Edit/delete buttons are only shown for notes the requesting user
 * authored (`note.isMine`, set by the server). The API also enforces
 * this — the data layer only looks inside the user's own notes file
 * for mutations.
 */

interface NoteItemProps {
  note: ThreadedNote;
  fileId: string;
  folderId: string;
  onMutated: () => void;
}

export function NoteItem({ note, fileId, folderId, onMutated }: NoteItemProps) {
  const player = usePlayer();
  const trackPending = useTrackPending();
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // Per-thread collapse. Ephemeral — not persisted to Drive, not in
  // localStorage. Resolved threads collapse on mount by default; the
  // user can still expand them locally without flipping the resolved
  // flag. Persistence of the collapsed state would also create a
  // surprise interaction with collaborative edits: a thread you
  // minimized could quietly grow new replies offscreen.
  const [isMinimized, setIsMinimized] = useState<boolean>(
    Boolean(note.resolved),
  );
  const [isResolving, setIsResolving] = useState(false);

  const seekToNote = () => player.seek(note.timestampMs / 1000);

  const replyCount = note.replies.length;
  const replyLabel = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
  const isResolved = Boolean(note.resolved);

  const handleToggleResolved = async () => {
    if (isResolving) return;
    setIsResolving(true);
    try {
      await trackPending(async () => {
        const res = await fetch(
          `/api/files/${fileId}/notes/${note.id}?folder=${folderId}`,
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
      alert(
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
        `/api/files/${fileId}/notes/${note.id}?folder=${folderId}`,
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
    if (!confirm('Delete this note? Your replies will be removed too.')) return;
    const res = await trackPending(() =>
      fetch(`/api/files/${fileId}/notes/${note.id}?folder=${folderId}`, {
        method: 'DELETE',
      }),
    );
    if (res.ok || res.status === 204) {
      onMutated();
    } else {
      alert('Failed to delete note.');
    }
  };

  const handleReply = async (body: string) => {
    await trackPending(async () => {
      const res = await fetch(
        `/api/files/${fileId}/notes/${note.id}/replies?folder=${folderId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
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
    <li className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-0 sm:gap-2">
          <span className="flex flex-row gap-2">
            <button
              type="button"
              onClick={() => setIsMinimized((v) => !v)}
              aria-label={isMinimized ? 'Expand thread' : 'Minimize thread'}
              aria-expanded={!isMinimized}
              title={isMinimized ? 'Expand thread' : 'Minimize thread'}
              className="-mr-1 px-1 text-sm leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <span aria-hidden="true">{isMinimized ? '▸' : '▾'}</span>
            </button>
            <AuthorTag note={note} />
            {isResolved && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Resolved
              </span>
            )}
          </span>
          <span className="flex flex-row gap-2 py-2 justify-between">
            {note.isMine && (
              <button
                type="button"
                onClick={handleToggleResolved}
                disabled={isResolving}
                className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100"
              >
                {isResolved ? 'Reopen thread' : 'Resolve thread'}
              </button>
            )}
            {isMinimized && replyCount > 0 && (
              <span className="text-xs text-neutral-500">
                <span aria-hidden="true">·</span> {replyLabel}
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={seekToNote}
          className="font-mono text-xs font-medium text-blue-600 tabular-nums hover:underline dark:text-blue-400"
          title="Jump to this timestamp"
        >
          {formatDuration(note.timestampMs / 1000)}
        </button>
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
              {note.body}
            </p>
          )}

          {!isEditing && (
            <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
              <button
                type="button"
                onClick={() => setIsReplying((v) => !v)}
                className="hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                Reply
              </button>
              {note.isMine && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="hover:text-neutral-900 dark:hover:text-neutral-100"
                  >
                    Edit
                  </button>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="hover:text-red-600 dark:hover:text-red-400"
                  >
                    Delete
                  </button>
                </>
              )}
              {replyCount > 0 && (
                <span className="ml-auto text-[11px]">{replyLabel}</span>
              )}
            </div>
          )}

          {isReplying && (
            <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900">
              <NoteForm
                placeholder="Write a reply…"
                submitLabel="Reply"
                onSubmit={handleReply}
                onCancel={() => setIsReplying(false)}
              />
            </div>
          )}

          {replyCount > 0 && (
            <ul className="mt-3 space-y-3 border-l-2 border-neutral-200 pl-3 dark:border-neutral-800">
              {note.replies.map((reply) => (
                <ReplyItem
                  key={reply.id}
                  reply={reply}
                  fileId={fileId}
                  folderId={folderId}
                  onMutated={onMutated}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function ReplyItem({
  reply,
  fileId,
  folderId,
  onMutated,
}: {
  reply: ThreadedNote;
  fileId: string;
  folderId: string;
  onMutated: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const handleEdit = async (body: string) => {
    const res = await fetch(
      `/api/files/${fileId}/notes/${reply.id}?folder=${folderId}`,
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
    if (!confirm('Delete this reply?')) return;
    const res = await fetch(
      `/api/files/${fileId}/notes/${reply.id}?folder=${folderId}`,
      { method: 'DELETE' },
    );
    if (res.ok || res.status === 204) onMutated();
    else alert('Failed to delete reply.');
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
          {reply.body}
        </p>
      )}
      {reply.isMine && !isEditing && (
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Edit
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={handleDelete}
            className="hover:text-red-600 dark:hover:text-red-400"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

function AuthorTag({
  note,
}: {
  note: ApiNote;
}) {
  const displayName = note.author?.name ?? note.author?.email ?? 'Someone';
  return (
    <span
      className='text-xs text-neutral-600 dark:text-neutral-400'
      title={note.author?.email ?? ''}
    >
      {displayName}
      {note.isMine && (
        <span className="ml-1 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          you
        </span>
      )}
    </span>
  );
}
