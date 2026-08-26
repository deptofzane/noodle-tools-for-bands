import { Modal } from '../../../Modal';
import {
  songCountLabel,
  type Conversation,
  type Setlist,
} from '../bandDetailShared';

/**
 * "Add to setlist" modal: pick one or more setlists to add the given song to.
 * Controlled by the parent (open when `target` is set).
 */
export function AddToSetlistModal({
  target,
  setlists,
  selected,
  busy,
  onToggle,
  onCancel,
  onConfirm,
}: {
  target: Conversation;
  setlists: Setlist[];
  selected: Set<string>;
  busy: boolean;
  onToggle: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onCancel}
      busy={busy}
      labelledBy="add-setlist-title"
      size="sm"
    >
      <h2 id="add-setlist-title" className="text-base font-semibold">
        Add to setlist
      </h2>
      <p className="mt-1 truncate text-sm text-fg-muted">
        {target.audioFileName ?? 'Untitled audio'}
      </p>

      {setlists.length === 0 ? (
        <p className="mt-4 rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
          No setlists yet. Create one first.
        </p>
      ) : (
        <ul className="mt-4 flex max-h-64 flex-col gap-1 overflow-auto">
          {setlists.map((sl) => {
            const checked = selected.has(sl.id);
            return (
              <li key={sl.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(sl.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {sl.name}
                  </span>
                  <span className="shrink-0 text-xs minor-text-theme-colors">
                    {songCountLabel(sl.songs)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-ghost"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || selected.size === 0}
          className="btn-primary"
        >
          {busy ? 'Adding…' : 'Add to setlist'}
        </button>
      </div>
    </Modal>
  );
}
