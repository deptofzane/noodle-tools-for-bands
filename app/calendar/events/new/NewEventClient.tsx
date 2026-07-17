'use client';

import { ensureOk } from '@/lib/api';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../Modal';
import { Select } from '../../../Select';
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
  defaultBandId = '',
}: {
  bands: BandOption[];
  defaultDate: string;
  /** Pre-selected owning band (e.g. when arriving from a band page). */
  defaultBandId?: string;
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  // Honor the pre-selected band only if the user is actually a member of it;
  // otherwise fall back to their first band.
  const initialBandId =
    defaultBandId && bands.some((b) => b.id === defaultBandId)
      ? defaultBandId
      : (bands[0]?.id ?? '');
  const [bandId, setBandId] = useState(initialBandId);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [setlistId, setSetlistId] = useState('');
  const [setlists, setSetlists] = useState<BandOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const [creatingSetlist, setCreatingSetlist] = useState(false);

  // Load the chosen band's setlists for the association picker; reset the
  // selection whenever the band changes (setlists are per-band).
  useEffect(() => {
    if (!bandId) {
      setSetlists([]);
      return;
    }
    let cancelled = false;
    setSetlistId('');
    fetch(`/api/bands/${bandId}/setlists`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { setlists: BandOption[] }) => {
        if (!cancelled)
          setSetlists(d.setlists.map((s) => ({ id: s.id, name: s.name })));
      })
      .catch(() => {
        if (!cancelled) setSetlists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId]);

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
            setlistId,
          }),
        });
        await ensureOk(r);
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

  // Quick-create an (empty) setlist without leaving the form: add it to the
  // dropdown and select it. Songs can be added to it later.
  const handleCreateSetlist = async () => {
    const name = newSetlistName.trim();
    if (!name || creatingSetlist || !bandId) return;
    setCreatingSetlist(true);
    try {
      const created = await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/setlists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, items: [] }),
        });
        await ensureOk(r);
        const data = (await r.json()) as {
          setlist: { id: string; name: string };
        };
        return data.setlist;
      });
      setSetlists((prev) => [{ id: created.id, name: created.name }, ...prev]);
      setSetlistId(created.id);
      setCreateOpen(false);
      setNewSetlistName('');
      showToast('Setlist created.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingSetlist(false);
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
        <h1 className="title-text">New event</h1>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canSave}
          className="shrink-0 btn-primary"
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="event-band" className="text-sm font-medium">
          Band
        </label>
        <Select
          id="event-band"
          value={bandId}
          onChange={setBandId}
          options={bands.map((b) => ({ value: b.id, label: b.name }))}
        />
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
        <label htmlFor="event-setlist" className="text-sm font-medium">
          Setlist
        </label>
        <Select
          id="event-setlist"
          value={setlistId}
          onChange={setSetlistId}
          options={[
            { value: '', label: 'None' },
            ...setlists.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        {setlists.length === 0 && (
          <p className="text-[11px] text-neutral-500">
            This band has no setlists yet.
          </p>
        )}
        {bandId && (
          <div className="pt-1.5">
            <button
              type="button"
              onClick={() => {
                setNewSetlistName('');
                setCreateOpen(true);
              }}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              + Create a new setlist
            </button>
          </div>
        )}
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

      {createOpen && (
        <Modal
          onClose={() => setCreateOpen(false)}
          busy={creatingSetlist}
          labelledBy="new-setlist-title"
          size="sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateSetlist();
            }}
          >
            <h2 id="new-setlist-title" className="text-base font-semibold">
              Create a setlist
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              It’ll be added to this event. You can add songs to it later.
            </p>
            <input
              value={newSetlistName}
              onChange={(e) => setNewSetlistName(e.target.value)}
              placeholder="Setlist name"
              autoFocus
              maxLength={255}
              className="mt-3 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={creatingSetlist}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingSetlist || !newSetlistName.trim()}
                className="btn-primary"
              >
                {creatingSetlist ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
