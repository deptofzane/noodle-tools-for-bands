'use client';

import { useRouter } from 'next/navigation';
import { ActionMenu, ActionMenuItem } from '../../ActionMenu';

/**
 * The song page's kebab, sitting on the "Song details" header row.
 *
 * Gathers the actions that used to be scattered around the page: "Edit song"
 * from the back-nav header, and the Practice / Live links from inside the
 * details body — which meant they could only be reached by expanding a section
 * that's collapsed by default.
 *
 * It lives on the header row rather than in the body so it stays reachable
 * whether the section is open or shut.
 */
export function SongActions({
  conversationId,
  hasSheetMusic,
}: {
  conversationId: string;
  /** Practice and Live are sheet-music screens; without one there's nothing
      for them to show, so they're left out rather than opening blank. */
  hasSheetMusic: boolean;
}) {
  const router = useRouter();

  return (
    <ActionMenu label="Song actions">
      <ActionMenuItem
        onClick={() => router.push(`/notes/${conversationId}/edit`)}
      >
        Edit song
      </ActionMenuItem>
      {hasSheetMusic && (
        <>
          <ActionMenuItem
            onClick={() => router.push(`/notes/${conversationId}/practice`)}
          >
            Practice
          </ActionMenuItem>
          <ActionMenuItem
            onClick={() => router.push(`/notes/${conversationId}/live`)}
          >
            Live
          </ActionMenuItem>
        </>
      )}
    </ActionMenu>
  );
}
