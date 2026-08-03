'use client';

import { useRouter } from 'next/navigation';
import { ActionMenu, ActionMenuItem } from '../../../../ActionMenu';

/**
 * Per-song kebab on the setlist page. For now it just jumps to the song's
 * edit page; kept as its own client component so the setlist page can stay a
 * server component.
 */
export function SetlistSongActions({
  conversationId,
}: {
  conversationId: string;
}) {
  const router = useRouter();
  return (
    <ActionMenu label="Song actions">
      <ActionMenuItem onClick={() => router.push(`/notes/${conversationId}`)}>
        View song
      </ActionMenuItem>
      <ActionMenuItem
        onClick={() => router.push(`/notes/${conversationId}/edit`)}
      >
        Edit song
      </ActionMenuItem>
    </ActionMenu>
  );
}
