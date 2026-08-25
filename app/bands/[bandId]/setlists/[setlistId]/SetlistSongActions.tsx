'use client';

import { useRouter } from 'next/navigation';
import { ActionMenu, MenuIconRow } from '../../../../ActionMenu';
import { useShareLink } from '../../../../useShareLink';
import { EyeIcon, LinkIcon, PencilIcon } from '../../../../icons';
import { songHref } from '@/lib/routes';

/**
 * Per-song kebab on the setlist page. Kept as its own client component so the
 * setlist page can stay a server component.
 *
 * `name` is here only to name the icons: a glyph has no text, so the song's
 * title is what a screen reader reads instead.
 */
export function SetlistSongActions({
  conversationId,
  name,
}: {
  conversationId: string;
  name: string;
}) {
  const router = useRouter();
  const share = useShareLink();
  return (
    <ActionMenu label="Song actions">
      <MenuIconRow
        items={[
          {
            key: 'view',
            icon: <EyeIcon size={18} />,
            label: `View ${name}`,
            title: 'View song',
            onClick: () => router.push(songHref(conversationId)),
          },
          {
            key: 'edit',
            icon: <PencilIcon size={18} />,
            label: `Edit ${name}`,
            title: 'Edit song',
            onClick: () => router.push(`/notes/${conversationId}/edit`),
          },
          {
            key: 'share',
            icon: <LinkIcon size={18} />,
            label: `Copy a link to ${name}`,
            title: 'Share song',
            onClick: () => void share(songHref(conversationId), 'Song'),
          },
        ]}
      />
    </ActionMenu>
  );
}
