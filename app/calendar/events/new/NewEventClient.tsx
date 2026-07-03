'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';

interface BandOption {
  id: string;
  name: string;
}

const field =
  'rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900';

/**
 * Create an event: pick the owning band, then fill in the details. On save
 * it goes to the new event's page, where people can be added.
 */
export function NewEventClient({
  bands,
  defaultDate,
}: {
  bands: BandOption[];
  defaultDate: string;
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [bandId, setBandId] = useState(bands[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const canSave = Boolean(bandId && title.trim() && date && !busy);

  const handleCreate = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const id = await trackPending(async () => {
        const r = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bandId,
            title: title.trim(),
            date,
            time,
            location,
            details,
          }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
        const data = (await r.json()) as { id: string };
        return data.id;
      });
      showToast('Event created.', 'success');
      router.push(`/calendar/events/${id}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (bands.length === 0) {
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        You need to be in a band to create an event.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">New event</h1>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canSave}
          className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="event-band" className="text-sm font-medium">
          Band
        </label>
        <select
          id="event-band"
          value={bandId}
          onChange={(e) => setBandId(e.target.value)}
          className={field}
        >
          {bands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-neutral-500">
          The band that owns this event. Its members can see it; you can add
          others later.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="event-title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="event-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
            value={time}
            onChange={(e) => setTime(e.target.value)}
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
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={255}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="event-details" className="text-sm font-medium">
          Details
        </label>
        <textarea
          id="event-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          className={field}
        />
      </div>
    </div>
  );
}
