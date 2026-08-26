'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../../../Modal';
import { LoadingBlock } from '../../../Spinner';

export interface AudioVersionOption {
  id: string;
  fileName: string;
  label: string | null;
  isDefault: boolean;
}

/**
 * Choose which recording of a song an album track plays.
 *
 * Versions are fetched when the picker opens rather than shipped with the song
 * pool: an album editor may list dozens of songs, and all but the one being
 * pinned would be loaded for nothing.
 *
 * "Whatever is current" is a real choice here, not the absence of one — it
 * means the track follows the song's default as that changes, which is what
 * most tracks want and what makes a pin meaningful when it is set.
 */
export function AlbumVersionPicker({
  conversationId,
  songName,
  selectedId,
  onSelect,
  onClose,
}: {
  conversationId: string;
  songName: string;
  /** Currently pinned version, or null for "follow the default". */
  selectedId: string | null;
  /**
   * The chosen version, with enough of it to caption the row straight away.
   * `null` means "follow the song's default". Passing the label back matters:
   * the editor has no other way to know what the picked version is *called*,
   * and a row reading "Pinned version" after you deliberately chose "Live
   * Take" gives no way to tell the two takes apart without reopening this.
   */
  onSelect: (
    version: { id: string; label: string | null; fileName: string } | null,
  ) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<AudioVersionOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conversations/${conversationId}/audio-versions`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d: { versions: AudioVersionOption[] }) => {
        if (!cancelled) setVersions(d.versions);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this song’s versions.');
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const choose = (
    version: { id: string; label: string | null; fileName: string } | null,
  ) => {
    onSelect(version);
    onClose();
  };

  return (
    <Modal onClose={onClose} labelledBy="version-picker-title" size="md">
      <h2 id="version-picker-title" className="text-base font-semibold">
        Version for {songName}
      </h2>

      {error ? (
        <p className="mt-4 text-sm text-danger">{error}</p>
      ) : !versions ? (
        <LoadingBlock label="Loading versions" className="py-6" />
      ) : (
        <ul className="mt-4 flex flex-col gap-1">
          <li>
            <button
              type="button"
              onClick={() => choose(null)}
              className={rowClass(selectedId === null)}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Whatever is current</span>
                <span className="block text-xs minor-text-theme-colors">
                  Follows the song’s default version if it changes
                </span>
              </span>
              {selectedId === null && <Tick />}
            </button>
          </li>
          {versions.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() =>
                  choose({ id: v.id, label: v.label, fileName: v.fileName })
                }
                className={rowClass(selectedId === v.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {v.label ?? v.fileName}
                  </span>
                  <span className="block truncate text-xs minor-text-theme-colors">
                    {v.label ? v.fileName : ''}
                    {v.isDefault
                      ? v.label
                        ? ' · current default'
                        : 'current default'
                      : ''}
                  </span>
                </span>
                {selectedId === v.id && <Tick />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="btn-outline">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function rowClass(selected: boolean): string {
  return (
    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ' +
    (selected
      ? 'bg-fill-2'
      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/60')
  );
}

function Tick() {
  return (
    <span aria-hidden="true" className="shrink-0 text-accent">
      ✓
    </span>
  );
}
