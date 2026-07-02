'use client';

import { useState } from 'react';
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

interface Song {
  conversationId: string;
  name: string;
}

/**
 * Edit a setlist's song order by drag-and-drop. Reorder is local until
 * Save, which PATCHes the new order; Cancel discards it. Dragging works
 * with pointer or keyboard (focus the handle, Space to lift, arrows to
 * move, Space to drop).
 */
export function EditSetlistClient({
  bandId,
  setlistId,
  name,
  initialSongs,
}: {
  bandId: string;
  setlistId: string;
  name: string;
  initialSongs: Song[];
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [songs, setSongs] = useState<Song[]>(initialSongs);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const viewHref = `/bands/${bandId}/setlists/${setlistId}`;
  const initialOrder = initialSongs.map((s) => s.conversationId).join(',');
  const currentOrder = songs.map((s) => s.conversationId).join(',');
  const dirty = initialOrder !== currentOrder;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSongs((prev) => {
      const from = prev.findIndex((s) => s.conversationId === active.id);
      const to = prev.findIndex((s) => s.conversationId === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  };

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/setlists/${setlistId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationIds: songs.map((s) => s.conversationId),
          }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      showToast('Setlist order saved.', 'success');
      router.push(viewHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <Link
          href={viewHref}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>

      {songs.length === 0 ? (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
          This setlist has no songs to reorder.
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            Drag the handle to reorder, or focus it and use the arrow keys.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={songs.map((s) => s.conversationId)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {songs.map((s, i) => (
                  <SortableRow
                    key={s.conversationId}
                    id={s.conversationId}
                    index={i}
                    name={s.name}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}

function SortableRow({
  id,
  index,
  name,
}: {
  id: string;
  index: number;
  name: string;
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
      className={`flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900 ${
        isDragging ? 'z-10 shadow-lg' : ''
      }`}
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
      <span className="w-5 shrink-0 text-right text-xs text-neutral-400">
        {index + 1}
      </span>
      <span className="truncate font-medium">{name}</span>
    </li>
  );
}
