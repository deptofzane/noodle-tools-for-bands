'use client';

import { ensureOk } from '@/lib/api';
import { addHoursToTime, DEFAULT_EVENT_DURATION_HOURS } from '@/lib/format';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../Modal';
import { Select } from '../../../Select';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { AutoTextarea } from '@/app/AutoTextarea';
import { CollapsibleSection } from '@/app/CollapsibleSection';
import { VenuePickerModal, type PickableVenue } from '../VenuePickerModal';
import { EventTypeField } from '../EventTypeField';
import { isTimeOff, TIME_OFF_TITLE } from '../../eventLabel';

interface BandOption {
  id: string;
  name: string;
}

// The current band is persisted here; the New event page defaults to it (see
// the mount effect below). Must match app/CurrentBandProvider.tsx.
const SELECTED_BAND_KEY = 'selectedBandId';

const field =
  'rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

/**
 * Create an event: pick the owning band, then fill in the details. On save
 * it goes to the new event's page, where people can be added.
 */
export function NewEventClient({
  bands,
  defaultDate,
  defaultBandId = '',
  defaultSetlistId = '',
}: {
  bands: BandOption[];
  defaultDate: string;
  /** Pre-selected owning band (e.g. when arriving from a band page). */
  defaultBandId?: string;
  /**
   * Pre-selected setlist (arriving from a setlist's "Create event using this
   * setlist"). Only meaningful alongside `defaultBandId` — setlists are
   * per-band, and one from another band is dropped once they load.
   */
  defaultSetlistId?: string;
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  // Honor the pre-selected band only if the user is actually a member of it;
  // otherwise fall back to their first band. (This is the SSR-safe initial
  // value; the header's current band is applied on mount below.)
  const initialBandId =
    defaultBandId && bands.some((b) => b.id === defaultBandId)
      ? defaultBandId
      : (bands[0]?.id ?? '');
  const [bandId, setBandId] = useState(initialBandId);

  // Unless the user arrived with an explicit band (?bandId=), default to the
  // band currently selected in the header. Read from localStorage after mount
  // so the server and first client render still agree.
  useEffect(() => {
    if (defaultBandId) return; // explicit intent wins
    try {
      const saved = localStorage.getItem(SELECTED_BAND_KEY);
      if (saved && bands.some((b) => b.id === saved)) setBandId(saved);
    } catch {
      // ignore unavailable storage
    }
    // Run once on mount; props are stable for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  // While false, the end time auto-follows the start (start + default). Once
  // the user edits the end themselves, we stop overriding it.
  const [endEdited, setEndEdited] = useState(false);
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [setlistId, setSetlistId] = useState(defaultSetlistId);
  const [setlists, setSetlists] = useState<BandOption[]>([]);
  const [venueId, setVenueId] = useState('');
  const [venues, setVenues] = useState<PickableVenue[]>([]);
  const [venuePickerOpen, setVenuePickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const [creatingSetlist, setCreatingSetlist] = useState(false);

  const selectedVenue = venues.find((v) => v.id === venueId) ?? null;

  // Load the chosen band's setlists and venues for the association pickers;
  // reset both selections whenever the band changes (they're per-band).
  const prevBandId = useRef<string | null>(null);
  useEffect(() => {
    /*
     * Clear the per-band pickers only when the band genuinely *changes* —
     * never on the first run, which would throw away a selection that arrived
     * as a query param (?setlistId=). Comparing against the previous band
     * rather than tripping a one-shot flag is also what makes this survive
     * StrictMode's double-mount in dev, where a flag would be spent on the
     * first pass and the second would clear the selection anyway.
     *
     * Skipping the first run costs nothing otherwise: both pickers already
     * start empty unless something was handed in.
     */
    const bandChanged =
      prevBandId.current !== null && prevBandId.current !== bandId;
    prevBandId.current = bandId;
    if (bandChanged) {
      setSetlistId('');
      setVenueId('');
    }

    if (!bandId) {
      setSetlists([]);
      setVenues([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/bands/${bandId}/setlists`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { setlists: BandOption[] }) => {
        if (cancelled) return;
        const list = d.setlists.map((s) => ({ id: s.id, name: s.name }));
        setSetlists(list);
        /*
         * A setlist id from the URL is only trustworthy once the band's own
         * list confirms it. Drop it otherwise, so the form state matches the
         * empty placeholder the picker is already showing — the alternative
         * is a filled-in form that fails on save with "That setlist isn't in
         * this band."
         */
        setSetlistId((cur) =>
          cur && !list.some((sl) => sl.id === cur) ? '' : cur,
        );
      })
      .catch(() => {
        if (!cancelled) setSetlists([]);
      });
    fetch(`/api/bands/${bandId}/venues`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { venues: PickableVenue[] }) => {
        if (!cancelled)
          setVenues(
            d.venues.map((v) => ({
              id: v.id,
              name: v.name,
              address: v.address,
            })),
          );
      })
      .catch(() => {
        if (!cancelled) setVenues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bandId]);

  // Time off carries no title of its own, so it can't be the thing that
  // blocks saving.
  const timeOff = isTimeOff(eventType);
  const canSave = Boolean(bandId && (timeOff || title.trim()) && date && !busy);

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
            title: timeOff ? TIME_OFF_TITLE : title.trim(),
            eventType,
            date,
            endDate,
            time,
            endTime,
            location,
            details,
            notes,
            setlistId,
            venueId,
          }),
        });
        await ensureOk(r);
        const data = (await r.json()) as { id: string };
        return data.id;
      });
      showToast('Event created.', 'success');
      // `replace`, not `push`: a form left in history is what Back returns to.
      router.replace(`/calendar/events/${id}`);
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
      <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
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
        <p className="text-[0.6875rem] minor-text-theme-colors">
          The band that owns this event. Its members can see it; you can add
          others later.
        </p>
      </div>

      {/* Time off is named after whoever booked it — "Time off - Steve",
          derived at display time — so there is nothing here to fill in. */}
      {!timeOff && (
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
      )}

      <EventTypeField
        value={eventType}
        onChange={setEventType}
        fieldClass={field}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="event-date" className="text-sm font-medium">
            Date
          </label>
          <input
            id="event-date"
            type="date"
            value={date}
            onChange={(e) => {
              const v = e.target.value;
              setDate(v);
              // A end that now precedes the start is no longer a range the
              // form can submit, so drop it rather than hold an invalid pair.
              if (endDate && v && endDate < v) setEndDate('');
            }}
            className={field}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="event-end-date" className="text-sm font-medium">
            End date
          </label>
          <input
            id="event-end-date"
            type="date"
            value={endDate}
            min={date || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className={field}
          />
          <span className="text-xs minor-text-theme-colors">
            Leave blank for a single day.
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="event-time" className="text-sm font-medium">
            Start time
          </label>
          <input
            id="event-time"
            type="time"
            value={time}
            onChange={(e) => {
              const v = e.target.value;
              setTime(v);
              // Auto-fill the end (+2h) until the user sets one themselves.
              if (!endEdited)
                setEndTime(
                  v
                    ? (addHoursToTime(v, DEFAULT_EVENT_DURATION_HOURS) ?? '')
                    : '',
                );
            }}
            className={field}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="event-end-time" className="text-sm font-medium">
            End time
          </label>
          <input
            id="event-end-time"
            type="time"
            value={endTime}
            disabled={!time}
            onChange={(e) => {
              setEndEdited(true);
              setEndTime(e.target.value);
            }}
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
        <label className="text-sm font-medium">Venue</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVenuePickerOpen(true)}
            className={`${field} flex-1 text-left`}
          >
            {selectedVenue ? (
              selectedVenue.name
            ) : (
              <span className="text-neutral-400">Choose a saved venue…</span>
            )}
          </button>
          {venueId && (
            <button
              type="button"
              onClick={() => setVenueId('')}
              className="btn-ghost shrink-0"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-[0.6875rem] minor-text-theme-colors">
          Optional — associate one of the band’s saved venues.
        </p>
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
          <p className="text-[0.6875rem] minor-text-theme-colors">
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
              className="text-xs font-medium text-accent hover:underline"
            >
              + Create a new setlist
            </button>
          </div>
        )}
      </div>

      <CollapsibleSection title="Details">
        <AutoTextarea
          id="event-details"
          aria-label="Details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          className={`${field} min-h-20`}
        />
        <p className="text-[0.6875rem] minor-text-theme-colors">
          Information about the event.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Notes">
        <AutoTextarea
          id="event-notes"
          aria-label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={`${field} min-h-20`}
        />
        <p className="text-[0.6875rem] minor-text-theme-colors">
          The band’s private notes — not shared to the calendar feed.
        </p>
      </CollapsibleSection>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canSave}
          className="shrink-0 btn-primary"
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>

      {venuePickerOpen && (
        <VenuePickerModal
          venues={venues}
          selectedId={venueId || null}
          onPick={(id) => {
            setVenueId(id ?? '');
            setVenuePickerOpen(false);
          }}
          onClose={() => setVenuePickerOpen(false)}
        />
      )}

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
            <p className="mt-1 text-sm text-fg-muted">
              It’ll be added to this event. You can add songs to it later.
            </p>
            <input
              value={newSetlistName}
              onChange={(e) => setNewSetlistName(e.target.value)}
              placeholder="Setlist name"
              autoFocus
              maxLength={255}
              className="mt-3 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
