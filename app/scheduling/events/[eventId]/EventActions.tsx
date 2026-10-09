'use client';

import { useState } from 'react';
import { useNavigate } from '../../../useNavigate';
import { ensureOk } from '@/lib/api';
import {
  ActionMenu,
  ActionMenuItem,
  MenuIconRow,
  MenuSectionLabel,
} from '../../../ActionMenu';
import { LinkIcon, PencilIcon } from '../../../icons';
import { useShareLink } from '../../../useShareLink';
import { ConfirmModal } from '../../../ConfirmModal';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { eventHref } from '@/lib/routes';

/**
 * The event's own actions, in a kebab beside its details.
 *
 * Rendered for everyone who can reach the page — sharing is available to any
 * attendee, not just the band — while Edit stays with band members. The page
 * itself is the access guard; this only decides what's offered.
 */
export function EventActions({
  eventId,
  canManage,
}: {
  eventId: string;
  /** Band member: may edit the event. Attendees may only share it. */
  canManage: boolean;
}) {
  const go = useNavigate();
  const share = useShareLink();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
        await ensureOk(r, [204]);
      });
      showToast('Event deleted.', 'success');
      // The page no longer exists — leave for the list it came off.
      go('/scheduling?view=events');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  return (
    <>
      <ActionMenu label="Event actions">
        {/* No View: this is the event's own page. Without Edit there'd be a
          single glyph sitting alone across the menu, which reads as a button
          nobody labelled — so a lone Share keeps its word. */}
        <MenuSectionLabel>Event</MenuSectionLabel>
        {canManage ? (
          <MenuIconRow
            items={[
              {
                key: 'edit',
                icon: <PencilIcon size={18} />,
                label: 'Edit this event',
                title: 'Edit event',
                onClick: () => go(`/scheduling/events/${eventId}/edit`),
              },
              {
                key: 'share',
                icon: <LinkIcon size={18} />,
                label: 'Copy a link to this event',
                title: 'Share event',
                onClick: () => void share(eventHref(eventId), 'Event'),
              },
            ]}
          />
        ) : (
          <ActionMenuItem
            onClick={() => void share(eventHref(eventId), 'Event')}
          >
            Share event
          </ActionMenuItem>
        )}
        {/* Worded rather than a fourth glyph: cloning has no icon anyone would
          read at a glance, and it acts on the whole event rather than being
          another way to open it. Band members only — the copy is owned by
          this event's band, so an attendee from outside has nowhere to put
          it. */}
        {canManage && (
          <ActionMenuItem
            onClick={() => go(`/scheduling/events/new?cloneFrom=${eventId}`)}
          >
            Clone event
          </ActionMenuItem>
        )}
        {canManage && (
          <ActionMenuItem destructive onClick={() => setConfirmingDelete(true)}>
            Delete event
          </ActionMenuItem>
        )}
      </ActionMenu>
      <ConfirmModal
        open={confirmingDelete}
        title="Delete event?"
        description="This permanently deletes this event. This can’t be undone."
        confirmLabel="Delete event"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}
