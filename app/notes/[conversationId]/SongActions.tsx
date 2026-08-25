'use client';

import { useNavigate } from '../../useNavigate';
import { ActionMenu, ActionMenuItem, MenuIconRow } from '../../ActionMenu';
import { useShareLink } from '../../useShareLink';
import { LinkIcon, PencilIcon } from '../../icons';
import { songHref } from '@/lib/routes';

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
  const go = useNavigate();
  const share = useShareLink();

  return (
    <ActionMenu label="Song actions">
      {/* No View: this is the song's own page. */}
      <MenuIconRow
        items={[
          {
            key: 'edit',
            icon: <PencilIcon size={18} />,
            label: 'Edit this song',
            title: 'Edit song',
            onClick: () => go(`/notes/${conversationId}/edit`),
          },
          {
            key: 'share',
            icon: <LinkIcon size={18} />,
            label: 'Copy a link to this song',
            title: 'Share song',
            onClick: () => void share(songHref(conversationId), 'Song'),
          },
        ]}
      />
      {hasSheetMusic && (
        <>
          <ActionMenuItem
            onClick={() => go(`/notes/${conversationId}/practice`)}
          >
            Practice
          </ActionMenuItem>
          <ActionMenuItem onClick={() => go(`/notes/${conversationId}/live`)}>
            Live
          </ActionMenuItem>
        </>
      )}
    </ActionMenu>
  );
}
