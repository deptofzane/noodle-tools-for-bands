'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';

interface EventFields {
  title: string;
  date: string;
  time: string;
  location: string;
  details: string;
  setlistId: string;
}

const field =
  'rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900';

/**
 * Edit an event's fields and, optionally, associate a setlist from the
 * owning band. Save persists everything; Cancel returns to the event.
 */
export function EditEventClient({
  eventId,
  bandName,
  setlists,
  initial,
}: {
  eventId: string;
  bandName: string;
  setlists: { id: string; name: string }[];
  initial: EventFields;
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [fields, setFields] = useState<EventFields>(initial);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof EventFields, v: string) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  const eventHref = `/calendar/events/${eventId}`;
  const canSave = Boolean(fields.title.trim() && fields.date && !busy);

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/events/${eventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      showToast('Event saved.', 'success');
      router.push(eventHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Edit event</h1>
        <div className="flex items-center gap-2">
          <Link
            href={eventHref}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <p className="text-sm text-neutral-500">{bandName}</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="event-title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="event-title"
          value={fields.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={255}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="event-date" className="text-sm font-medium">
            Date
          </label>
          <input
            id="event-date"
            type="date"
            value={fields.date}
            onChange={(e) => set('date', e.target.value)}
            className={field}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="event-time" className="text-sm font-medium">
            Time
          </label>
          <input
            id="event-time"
            type="time"
            value={fields.time}
            onChange={(e) => set('time', e.target.value)}
            className={field}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="event-location" className="text-sm font-medium">
          Location
        </label>
        <input
          id="event-location"
          value={fields.location}
          onChange={(e) => set('location', e.target.value)}
          maxLength={255}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="event-setlist" className="text-sm font-medium">
          Setlist
        </label>
        <select
          id="event-setlist"
          value={fields.setlistId}
          onChange={(e) => set('setlistId', e.target.value)}
          className={field}
        >
          <option value="">None</option>
          {setlists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {setlists.length === 0 && (
          <p className="text-[11px] text-neutral-500">
            This band has no setlists yet.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="event-details" className="text-sm font-medium">
          Details
        </label>
        <textarea
          id="event-details"
          value={fields.details}
          onChange={(e) => set('details', e.target.value)}
          rows={3}
          className={field}
        />
      </div>
    </div>
  );
}
