'use client';

import { useNavigate } from '../../../useNavigate';
import {
  ActionMenu,
  MenuIconRow,
  MenuSectionLabel,
} from '../../../ActionMenu';
import { useShareLink } from '../../../useShareLink';
import { LinkIcon, PencilIcon } from '../../../icons';
import { venueHref } from '@/lib/routes';

/**
 * The venue page's kebab.
 *
 * No View — this is the venue's own page — and no Delete: that lives on the
 * Venues tab, next to the list it removes a row from, which is where someone
 * deleting one is already looking.
 */
export function ViewVenueActions({
  venueId,
  name,
}: {
  venueId: string;
  name: string;
}) {
  const go = useNavigate();
  const share = useShareLink();

  return (
    <ActionMenu label={`Actions for ${name}`}>
      <MenuSectionLabel>Venue</MenuSectionLabel>
      <MenuIconRow
        items={[
          {
            key: 'edit',
            icon: <PencilIcon size={18} />,
            label: `Edit ${name}`,
            title: 'Edit venue',
            onClick: () => go(`/scheduling/venues/${venueId}/edit`),
          },
          {
            key: 'share',
            icon: <LinkIcon size={18} />,
            label: `Copy a link to ${name}`,
            title: 'Share venue',
            onClick: () => void share(venueHref(venueId), 'Venue'),
          },
        ]}
      />
    </ActionMenu>
  );
}
