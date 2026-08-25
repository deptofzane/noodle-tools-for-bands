'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigate } from '../../../../useNavigate';
import { ensureOk } from '@/lib/api';
import {
  ActionMenu,
  ActionMenuItem,
  MenuIconRow,
} from '../../../../ActionMenu';
import { LinkIcon, PencilIcon } from '../../../../icons';
import { ConfirmModal } from '../../../../ConfirmModal';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';
import { useShareLink } from '../../../../useShareLink';
import { noteHref } from '@/lib/routes';

/**
 * The note's own actions. Editing and deleting belong to the author; sharing
 * is offered to anyone who can read the page, which for a shared note is the
 * whole band.
 */
export function ViewNoteActions({
  bandId,
  noteId,
  title,
  canManage,
  backHref,
}: {
  bandId: string;
  noteId: string;
  title: string;
  /** The author: may edit and delete. Everyone else may only share. */
  canManage: boolean;
  /** Where to land after deleting — this page stops existing. */
  backHref: string;
}) {
  const router = useRouter();
  const go = useNavigate();
  const share = useShareLink();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`/api/bands/${bandId}/notes/${noteId}`, {
          method: 'DELETE',
        });
        await ensureOk(res, [204]);
      });
      showToast('Note deleted.', 'success');
      /*
       * `replace`, not `push`: the page we're standing on has just stopped
       * existing, and leaving it in history means Back returns to a 404.
       */
      router.replace(backHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <ActionMenu label={`Actions for ${title}`} disabled={deleting}>
        {/* No View: this is the note's own page. A lone Share keeps its word
            rather than becoming an unaccompanied glyph. */}
        {canManage ? (
          <MenuIconRow
            items={[
              {
                key: 'edit',
                icon: <PencilIcon size={18} />,
                label: `Edit ${title}`,
                title: 'Edit note',
                onClick: () => go(`/bands/${bandId}/notes/${noteId}/edit`),
              },
              {
                key: 'share',
                icon: <LinkIcon size={18} />,
                label: `Copy a link to ${title}`,
                title: 'Share note',
                onClick: () => void share(noteHref(bandId, noteId), 'Note'),
              },
            ]}
          />
        ) : (
          <ActionMenuItem
            onClick={() => void share(noteHref(bandId, noteId), 'Note')}
          >
            Share note
          </ActionMenuItem>
        )}
        {canManage && (
          <ActionMenuItem destructive onClick={() => setConfirmOpen(true)}>
            Delete note
          </ActionMenuItem>
        )}
      </ActionMenu>

      <ConfirmModal
        open={confirmOpen}
        title={`Delete “${title}”?`}
        description="This removes the note and its links. This can’t be undone."
        confirmLabel="Delete note"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
