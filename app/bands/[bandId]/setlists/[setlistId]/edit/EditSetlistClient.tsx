'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTrackPending } from '../../../../../PendingActionProvider';
import { useToast } from '../../../../../ToastProvider';

/** A setlist entry: a song (conversationId) or a marker (set break / custom). */
interface Item {
  id: string;
  conversationId: string | null;
  name: string;
}

interface BandSong {
  conversationId: string;
  name: string;
}

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;

/**
 * Edit a setlist's items: add songs, set breaks, or custom markers; remove
 * and reorder (drag-and-drop). All edits are local until Save, which PATCHes
 * the full item list; Cancel discards them. Dragging works with pointer or
 * keyboard (focus the handle, Space to lift, arrows to move, Space to drop).
 */
export function EditSetlistClient({
  bandId,
  setlistId,
  name,
  initialSongs,
  bandSongs,
}: {
  bandId: string;
  setlistId: string;
  name: string;
  initialSongs: Item[];
  /** All the band's unarchived songs — the pool to add from. */
  bandSongs: BandSong[];
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [items, setItems] = useState<Item[]>(initialSongs);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherName, setOtherName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const viewHref = `/bands/${bandId}/setlists/${setlistId}`;
  // Compare by content (song id or marker label), so add/remove/reorder/rename
  // all count — but the row id (which changes on save) doesn't.
  const serialize = (list: Item[]) =>
    list.map((s) => s.conversationId ?? `marker:${s.name}`).join('|');
  const dirty = serialize(initialSongs) !== serialize(items);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const from = prev.findIndex((s) => s.id === active.id);
      const to = prev.findIndex((s) => s.id === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((s) => s.id !== id));
  };

  const addSetBreak = () =>
    setItems((prev) => [...prev, { id: uid(), conversationId: null, name: 'Set break' }]);

  const addOther = () => {
    const label = otherName.trim();
    if (!label) return;
    setItems((prev) => [...prev, { id: uid(), conversationId: null, name: label }]);
    setOtherName('');
    setOtherOpen(false);
  };

  // Songs available to add: the band's songs not already in the setlist,
  // alphabetical, filtered by the search box.
  const candidates = useMemo(() => {
    const inSetlist = new Set(
      items.filter((s) => s.conversationId).map((s) => s.conversationId),
    );
    const q = search.trim().toLowerCase();
    return bandSongs
      .filter((s) => !inSetlist.has(s.conversationId))
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bandSongs, items, search]);

  const openAdd = () => {
    setSearch('');
    setSelectedToAdd(new Set());
    setAddOpen(true);
  };

  const toggleAdd = (id: string) => {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSongs = () => {
    if (selectedToAdd.size === 0) return;
    const picks = bandSongs
      .filter((s) => selectedToAdd.has(s.conversationId))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ id: uid(), conversationId: s.conversationId, name: s.name }));
    setItems((prev) => [...prev, ...picks]);
    setAddOpen(false);
  };

  // Close the modals on Escape.
  useEffect(() => {
    if (!addOpen && !otherOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddOpen(false);
        setOtherOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addOpen, otherOpen]);

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/setlists/${setlistId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map((s) => ({
              conversationId: s.conversationId,
              label: s.conversationId ? null : s.name,
            })),
          }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      showToast('Setlist saved.', 'success');
      router.push(viewHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 mt-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={viewHref}
          className="rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          Cancel
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAdd}
            className="rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Add songs
          </button>
          <button
            type="button"
            onClick={addSetBreak}
            className="rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Add set break
          </button>
          <button
            type="button"
            onClick={() => {
              setOtherName('');
              setOtherOpen(true);
            }}
            className="rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Add other
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <h1 className="title-text">{name}</h1>

      {items.length === 0 ? (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
          Nothing in this setlist yet. Add songs, a set break, or something
          custom.
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            Drag the handle to reorder (or focus it and use the arrow keys);
            remove an item with ✕.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {items.map((s) => (
                  <SortableRow
                    key={s.id}
                    id={s.id}
                    name={s.name}
                    isMarker={!s.conversationId}
                    onRemove={() => handleRemove(s.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}

      {addOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-songs-title"
          className="fixed inset-0 z-50 flex bg-black/40 sm:items-center sm:justify-center sm:p-4"
          onClick={() => setAddOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full flex-col bg-white dark:bg-neutral-900 sm:h-[80vh] sm:max-w-md sm:rounded-lg sm:border sm:border-neutral-200 sm:shadow-xl dark:sm:border-neutral-800"
          >
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <h2 id="add-songs-title" className="text-base font-semibold">
                Add songs
              </h2>
              <span className="text-xs text-neutral-500">
                {selectedToAdd.size} selected
              </span>
            </div>

            <div className="px-4 py-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search songs"
                autoFocus
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-2">
              {candidates.length === 0 ? (
                <p className="px-2 py-10 text-center text-sm text-neutral-500">
                  {search.trim()
                    ? 'No matching songs.'
                    : 'No more songs to add.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-1 pb-2">
                  {candidates.map((s) => {
                    const checked = selectedToAdd.has(s.conversationId);
                    return (
                      <li key={s.conversationId}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAdd(s.conversationId)}
                            className="h-4 w-4"
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {s.name}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-md px-4 py-3 md:py-1.5 md:px-3 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSongs}
                disabled={selectedToAdd.size === 0}
                className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Add songs
              </button>
            </div>
          </div>
        </div>
      )}

      {otherOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-other-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOtherOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              addOther();
            }}
            className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 id="add-other-title" className="text-base font-semibold">
              Add item
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              A custom entry that isn’t a song (e.g. “Encore”, “Announcements”).
            </p>
            <input
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              placeholder="Name"
              autoFocus
              maxLength={100}
              className="mt-3 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOtherOpen(false)}
                className="rounded-md px-4 py-3 md:py-1.5 md:px-3 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!otherName.trim()}
                className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SortableRow({
  id,
  name,
  isMarker,
  onRemove,
}: {
  id: string;
  name: string;
  isMarker: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-sm ${
        isMarker
          ? 'border-dashed border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/50'
          : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
      } ${isDragging ? 'z-10 shadow-lg' : ''}`}
    >
      <button
        type="button"
        aria-label={`Reorder ${name}`}
        className="cursor-grab touch-none px-1 text-neutral-400 hover:text-neutral-700 active:cursor-grabbing dark:hover:text-neutral-200"
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <span
        className={`min-w-0 flex-1 truncate ${
          isMarker
            ? 'text-xs font-semibold uppercase tracking-wide text-neutral-500'
            : 'font-medium'
        }`}
      >
        {name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="shrink-0 rounded px-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </li>
  );
}
