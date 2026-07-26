'use client';

import { useMemo, useState } from 'react';
import { Modal } from '../../Modal';

export interface PickableVenue {
  id: string;
  name: string;
  address: string | null;
}

/**
 * A searchable venue picker. Lists the band's venues alphabetically with a
 * search box at the top (filters by name or address), and a "No venue" option
 * to clear the association. Selecting one calls `onPick` and closes.
 */
export function VenuePickerModal({
  venues,
  selectedId,
  onPick,
  onClose,
}: {
  venues: PickableVenue[];
  selectedId: string | null;
  /** null clears the association. */
  onPick: (venueId: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.address ?? '').toLowerCase().includes(q),
    );
  }, [venues, query]);

  return (
    <Modal onClose={onClose} labelledBy="venue-picker-title" size="sm">
      <h2 id="venue-picker-title" className="text-base font-semibold">
        Choose a venue
      </h2>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search venues…"
        autoFocus
        className="mt-3 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      <ul className="mt-3 flex max-h-[50vh] flex-col overflow-y-auto">
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <span className="w-3 shrink-0 text-blue-600 dark:text-blue-400">
              {selectedId === null ? '✓' : ''}
            </span>
            <span className="text-neutral-500">No venue</span>
          </button>
        </li>

        {filtered.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => onPick(v.id)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <span className="w-3 shrink-0 text-blue-600 dark:text-blue-400">
                {v.id === selectedId ? '✓' : ''}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{v.name}</span>
                {v.address && (
                  <span className="block truncate text-xs text-neutral-500">
                    {v.address}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-neutral-500">
            {venues.length === 0
              ? 'This band has no saved venues yet.'
              : 'No venues match your search.'}
          </li>
        )}
      </ul>

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className="btn-ghost">
          Cancel
        </button>
      </div>
    </Modal>
  );
}
