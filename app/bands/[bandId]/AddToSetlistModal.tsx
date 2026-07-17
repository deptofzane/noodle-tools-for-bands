import { songCountLabel, type Conversation, type Setlist } from './bandDetailShared';

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-setlist-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-setlist-title" className="text-base font-semibold">
          Add to setlist
        </h2>
        <p className="mt-1 truncate text-sm text-neutral-600 dark:text-neutral-400">
          {target.audioFileName ?? 'Untitled audio'}
        </p>

        {setlists.length === 0 ? (
          <p className="mt-4 rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
            No setlists yet. Create one first.
          </p>
        ) : (
          <ul className="mt-4 flex max-h-64 flex-col gap-1 overflow-auto">
            {setlists.map((sl) => {
              const checked = selected.has(sl.id);
              return (
                <li key={sl.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(sl.id)}
                      className="h-4 w-4"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {sl.name}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500">
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
            className="rounded-md px-4 py-3 md:py-1.5 md:px-3 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || selected.size === 0}
            className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add to setlist'}
          </button>
        </div>
      </div>
    </div>
  );
}
