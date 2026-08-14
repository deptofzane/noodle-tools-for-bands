'use client';

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
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
import { Modal } from '../../../Modal';

/** A setlist entry: a song (conversationId) or a marker (set break / custom). */
export interface SetlistItem {
  id: string;
  conversationId: string | null;
  name: string;
}

/** A song the user can add — the band's unarchived songs. */
export interface SetlistPoolSong {
  conversationId: string;
  name: string;
}

/** Client-side row id (real ids are assigned by the server on save). */
export const makeSetlistRowId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;

const addBtnClass = 'btn-outline';

/**
 * The shared body of the New/Edit setlist screens: the "Add songs / set break /
 * other" buttons, the drag-to-reorder item list, and the add-songs / add-other
 * modals. The parent owns the `items` state (plus name / save / dirty concerns);
 * this component owns all item manipulation and its own modal state.
 */
export function SetlistItemsEditor({
  items,
  onItemsChange,
  songPool,
  emptyText,
  hint,
  allowMarkers = true,
  allowDuplicates = false,
  renderItemActions,
}: {
  items: SetlistItem[];
  onItemsChange: Dispatch<SetStateAction<SetlistItem[]>>;
  songPool: SetlistPoolSong[];
  emptyText: string;
  /** Optional reorder hint shown above the list when it's non-empty. */
  hint?: string;
  /**
   * Whether set break / encore / other can be added. Albums are only songs —
   * there's no such thing as a set break on a record.
   */
  allowMarkers?: boolean;
  /**
   * Whether a song already in the list can be added again. Setlists say no (a
   * song is played once); albums say yes, since the same song can appear twice
   * pinned to different takes.
   */
  allowDuplicates?: boolean;
  /**
   * Extra control on each row, before the remove button — the album editor's
   * version picker. Rows stay drag-reorderable regardless.
   */
  renderItemActions?: (item: SetlistItem) => ReactNode;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherName, setOtherName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onItemsChange((prev) => {
      const from = prev.findIndex((s) => s.id === active.id);
      const to = prev.findIndex((s) => s.id === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  };

  const handleRemove = (id: string) =>
    onItemsChange((prev) => prev.filter((s) => s.id !== id));

  const addSetBreak = () =>
    onItemsChange((prev) => [
      ...prev,
      { id: makeSetlistRowId(), conversationId: null, name: 'Set break' },
    ]);

  const addEncore = () =>
    onItemsChange((prev) => [
      ...prev,
      { id: makeSetlistRowId(), conversationId: null, name: 'Encore' },
    ]);

  const addOther = () => {
    const label = otherName.trim();
    if (!label) return;
    onItemsChange((prev) => [
      ...prev,
      { id: makeSetlistRowId(), conversationId: null, name: label },
    ]);
    setOtherName('');
    setOtherOpen(false);
  };

  // Songs available to add: the pool, alphabetical, filtered by the search
  // box — minus what's already in the list, unless duplicates are allowed.
  const candidates = useMemo(() => {
    const already = new Set(
      items.filter((s) => s.conversationId).map((s) => s.conversationId),
    );
    const q = search.trim().toLowerCase();
    return songPool
      .filter((s) => allowDuplicates || !already.has(s.conversationId))
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [songPool, items, search, allowDuplicates]);

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
    const picks = songPool
      .filter((s) => selectedToAdd.has(s.conversationId))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        id: makeSetlistRowId(),
        conversationId: s.conversationId,
        name: s.name,
      }));
    onItemsChange((prev) => [...prev, ...picks]);
    setAddOpen(false);
  };

  // Close the (full-screen) add-songs modal on Escape. The add-other modal is
  // a <Modal>, which handles its own Escape.
  useEffect(() => {
    if (!addOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAddOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addOpen]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={openAdd} className={addBtnClass}>
          Add songs
        </button>
        {allowMarkers && (
          <>
            <button type="button" onClick={addSetBreak} className={addBtnClass}>
              Add set break
            </button>
            <button type="button" onClick={addEncore} className={addBtnClass}>
              Add encore
            </button>
            <button
              type="button"
              onClick={() => {
                setOtherName('');
                setOtherOpen(true);
              }}
              className={addBtnClass}
            >
              Add other
            </button>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
          {emptyText}
        </p>
      ) : (
        <>
          {hint && <p className="text-xs minor-text-theme-colors">{hint}</p>}
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
                    actions={renderItemActions?.(s)}
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
              <span className="text-xs minor-text-theme-colors">
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
                <p className="px-2 py-10 text-center text-sm minor-text-theme-colors">
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
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSongs}
                disabled={selectedToAdd.size === 0}
                className="btn-primary"
              >
                Add songs
              </button>
            </div>
          </div>
        </div>
      )}

      {otherOpen && (
        <Modal
          onClose={() => setOtherOpen(false)}
          labelledBy="add-other-title"
          size="sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addOther();
            }}
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
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!otherName.trim()}
                className="btn-primary"
              >
                Add
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function SortableRow({
  id,
  name,
  isMarker,
  onRemove,
  actions,
}: {
  id: string;
  name: string;
  isMarker: boolean;
  onRemove: () => void;
  /** Caller-supplied control, between the name and the remove button. */
  actions?: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = { transform: CSS.Transform.toString(transform), transition };

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
            ? 'text-xs font-semibold uppercase tracking-wide minor-text-theme-colors'
            : 'font-medium'
        }`}
      >
        {name}
      </span>
      {actions}
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
