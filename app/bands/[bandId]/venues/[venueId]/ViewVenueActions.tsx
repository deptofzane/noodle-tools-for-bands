'use client';

import { useRouter } from 'next/navigation';
import { ActionMenu, MenuIconRow } from '../../../../ActionMenu';
import { useShareLink } from '../../../../useShareLink';
import { LinkIcon, PencilIcon } from '../../../../icons';
import { venueHref } from '@/lib/routes';

/**
 * The venue page's kebab.
 *
 * No View — this is the venue's own page — and no Delete: that lives on the
 * Venues tab, next to the list it removes a row from, which is where someone
 * deleting one is already looking.
 */
export function ViewVenueActions({
  bandId,
  venueId,
  name,
}: {
  bandId: string;
  venueId: string;
  name: string;
}) {
  const router = useRouter();
  const share = useShareLink();

  return (
    <ActionMenu label={`Actions for ${name}`}>
      <MenuIconRow
        items={[
          {
            key: 'edit',
            icon: <PencilIcon size={18} />,
            label: `Edit ${name}`,
            title: 'Edit venue',
            onClick: () =>
              router.push(`/bands/${bandId}/venues/${venueId}/edit`),
          },
          {
            key: 'share',
            icon: <LinkIcon size={18} />,
            label: `Copy a link to ${name}`,
            title: 'Share venue',
            onClick: () => void share(venueHref(bandId, venueId), 'Venue'),
          },
        ]}
      />
    </ActionMenu>
  );
}
