import Link from 'next/link';
import { ActionMenu, ActionMenuItem } from '../../ActionMenu';
import { formatRelativeTime, formatSongMeta } from '@/lib/format';
import type { Conversation } from './bandDetailShared';

/**
 * A single audio-track row in the band's Audio tab: a link to the song plus a
 * kebab menu of actions. Presentational — the parent supplies the handlers.
 */
export function SongRow({
  c,
  disabled,
  onAddToSetlist,
  onEdit,
  onToggleArchive,
  onDelete,
}: {
  c: Conversation;
  disabled: boolean;
  onAddToSetlist: (c: Conversation) => void;
  onEdit: (c: Conversation) => void;
  onToggleArchive: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}) {
  const meta = formatSongMeta(c.bpm, c.key);
  return (
    <li className="flex items-center gap-2 pr-4 hover:bg-neutral-50 dark:hover:bg-neutral-900">
      <Link
        href={`/notes/${c.id}?from=audio`}
        className="min-w-0 flex-1 px-4 py-3 md:py-1.5 md:px-3 text-sm"
      >
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            {c.audioFileName ?? 'Untitled audio'}
          </span>
          {c.closed && (
            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              closed
            </span>
          )}
        </div>
        {meta && (
          <div className="mt-0.5 text-xs text-neutral-500">{meta}</div>
        )}
        <div className="mt-0.5 text-xs text-neutral-500">
          Updated {formatRelativeTime(c.updatedAt)}
        </div>
      </Link>
      <ActionMenu label="Song actions" disabled={disabled}>
        <ActionMenuItem onClick={() => onAddToSetlist(c)}>
          Add to setlist
        </ActionMenuItem>
        <ActionMenuItem onClick={() => onEdit(c)}>Edit song</ActionMenuItem>
        <ActionMenuItem onClick={() => onToggleArchive(c)}>
          {c.archived ? 'Unarchive song' : 'Archive song'}
        </ActionMenuItem>
        <ActionMenuItem destructive onClick={() => onDelete(c)}>
          Delete
        </ActionMenuItem>
      </ActionMenu>
    </li>
  );
}
