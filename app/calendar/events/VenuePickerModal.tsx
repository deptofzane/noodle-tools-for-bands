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
        className="mt-3 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <ul className="mt-3 flex max-h-[50vh] flex-col overflow-y-auto">
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-hover"
          >
            <span className="w-3 shrink-0 text-accent">
              {selectedId === null ? '✓' : ''}
            </span>
            <span className="minor-text-theme-colors">No venue</span>
          </button>
        </li>

        {filtered.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => onPick(v.id)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-hover"
            >
              <span className="w-3 shrink-0 text-accent">
                {v.id === selectedId ? '✓' : ''}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{v.name}</span>
                {v.address && (
                  <span className="block truncate text-xs minor-text-theme-colors">
                    {v.address}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm minor-text-theme-colors">
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
