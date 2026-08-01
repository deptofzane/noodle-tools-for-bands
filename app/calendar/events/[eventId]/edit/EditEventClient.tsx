'use client';

import { ensureOk } from '@/lib/api';
import { addHoursToTime, DEFAULT_EVENT_DURATION_HOURS } from '@/lib/format';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../../../../Modal';
import { Select } from '../../../../Select';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';
import { useCanGoBack } from '@/app/NavigationHistoryProvider';
import { AutoTextarea } from '@/app/AutoTextarea';
import { CollapsibleSection } from '@/app/CollapsibleSection';
import { VenuePickerModal, type PickableVenue } from '../../VenuePickerModal';
import { EventTypeField } from '../../EventTypeField';

interface EventFields {
  title: string;
  eventType: string;
  date: string;
  time: string;
  endTime: string;
  location: string;
  details: string;
  notes: string;
  setlistId: string;
  venueId: string;
}

const field =
  'rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900';

/**
 * Edit an event's fields and, optionally, associate a setlist from the
 * owning band. Save persists everything; Cancel returns to the event.
 */
export function EditEventClient({
  eventId,
  bandId,
  bandName,
  setlists: initialSetlists,
  venues,
  initial,
}: {
  eventId: string;
  bandId: string;
  bandName: string;
  setlists: { id: string; name: string }[];
  venues: PickableVenue[];
  initial: EventFields;
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const canGoBack = useCanGoBack();

  const [fields, setFields] = useState<EventFields>(initial);
  const [busy, setBusy] = useState(false);
  const [setlists, setSetlists] = useState(initialSetlists);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const [creatingSetlist, setCreatingSetlist] = useState(false);
  const [venuePickerOpen, setVenuePickerOpen] = useState(false);

  const selectedVenue = venues.find((v) => v.id === fields.venueId) ?? null;

  const set = (k: keyof EventFields, v: string) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  // Editing the start re-derives the end (+2h) as long as the current end is
  // empty or still the auto value for the previous start; a hand-set end that
  // differs is left alone.
  const setStart = (v: string) =>
    setFields((prev) => {
      const autoPrev = prev.time
        ? addHoursToTime(prev.time, DEFAULT_EVENT_DURATION_HOURS)
        : '';
      const keepEnd = prev.endTime && prev.endTime !== autoPrev;
      const endTime = keepEnd
        ? prev.endTime
        : v
          ? (addHoursToTime(v, DEFAULT_EVENT_DURATION_HOURS) ?? '')
          : '';
      return { ...prev, time: v, endTime };
    });

  const eventHref = `/calendar/events/${eventId}`;

  const leave = () => {
    if (canGoBack()) router.back();
    else router.push(eventHref);
  };

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
        await ensureOk(r);
      });
      showToast('Event saved.', 'success');
      router.push(eventHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // Quick-create an (empty) setlist without leaving the form: add it to the
  // dropdown and select it. Songs can be added to it later.
  const handleCreateSetlist = async () => {
    const name = newSetlistName.trim();
    if (!name || creatingSetlist) return;
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
      set('setlistId', created.id);
      setCreateOpen(false);
      setNewSetlistName('');
      showToast('Setlist created.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingSetlist(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 mt-2">
      <div className="flex items-center gap-2 justify-between">
        <button type="button" onClick={leave} className="btn-outline">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="btn-primary"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <h1 className="title-text">Edit event</h1>
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

      <EventTypeField
        value={fields.eventType}
        onChange={(v) => set('eventType', v)}
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
            value={fields.date}
            onChange={(e) => set('date', e.target.value)}
            className={field}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="event-time" className="text-sm font-medium">
            Start time
          </label>
          <input
            id="event-time"
            type="time"
            value={fields.time}
            onChange={(e) => setStart(e.target.value)}
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
            value={fields.endTime}
            disabled={!fields.time}
            onChange={(e) => set('endTime', e.target.value)}
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
          {fields.venueId && (
            <button
              type="button"
              onClick={() => set('venueId', '')}
              className="btn-ghost shrink-0"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-[0.6875rem] text-neutral-500">
          Optional — associate one of the band’s saved venues.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="event-setlist" className="text-sm font-medium">
          Setlist
        </label>
        <Select
          id="event-setlist"
          value={fields.setlistId}
          onChange={(v) => set('setlistId', v)}
          options={[
            { value: '', label: 'None' },
            ...setlists.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        {setlists.length === 0 && (
          <p className="text-[0.6875rem] text-neutral-500">
            This band has no setlists yet.
          </p>
        )}
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
      </div>

      <CollapsibleSection title="Details">
        <AutoTextarea
          id="event-details"
          aria-label="Details"
          value={fields.details}
          onChange={(e) => set('details', e.target.value)}
          rows={3}
          className={`${field} min-h-20`}
        />
        <p className="text-[0.6875rem] text-neutral-500">
          Information about the event.
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Notes">
        <AutoTextarea
          id="event-notes"
          aria-label="Notes"
          value={fields.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          className={`${field} min-h-20`}
        />
        <p className="text-[0.6875rem] text-neutral-500">
          The band’s private notes — not shared to the calendar feed.
        </p>
      </CollapsibleSection>

      {venuePickerOpen && (
        <VenuePickerModal
          venues={venues}
          selectedId={fields.venueId || null}
          onPick={(id) => {
            set('venueId', id ?? '');
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
