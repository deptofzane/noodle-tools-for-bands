'use client';

import { useNavigate } from '../../../useNavigate';
import {
  ActionMenu,
  ActionMenuItem,
  MenuIconRow,
  MenuSectionLabel,
} from '../../../ActionMenu';
import { LinkIcon, PencilIcon } from '../../../icons';
import { useShareLink } from '../../../useShareLink';
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

  return (
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
              onClick: () => go(`/calendar/events/${eventId}/edit`),
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
        <ActionMenuItem onClick={() => void share(eventHref(eventId), 'Event')}>
          Share event
        </ActionMenuItem>
      )}
    </ActionMenu>
  );
}
