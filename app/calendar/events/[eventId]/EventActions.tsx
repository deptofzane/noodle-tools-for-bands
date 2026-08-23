'use client';

import { useRouter } from 'next/navigation';
import { ActionMenu, ActionMenuItem } from '../../../ActionMenu';
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
  const router = useRouter();
  const share = useShareLink();

  return (
    <ActionMenu label="Event actions">
      {canManage && (
        <ActionMenuItem
          onClick={() => router.push(`/calendar/events/${eventId}/edit`)}
        >
          Edit event
        </ActionMenuItem>
      )}
      <ActionMenuItem onClick={() => void share(eventHref(eventId), 'Event')}>
        Share event
      </ActionMenuItem>
    </ActionMenu>
  );
}
