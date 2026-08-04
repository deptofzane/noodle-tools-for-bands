'use client';

import { ensureOk } from '@/lib/api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { useCanGoBack } from '@/app/NavigationHistoryProvider';

export interface VenueFields {
  name: string;
  address: string;
  phone: string;
  email: string;
  contactName: string;
  notes: string;
}

export const EMPTY_VENUE: VenueFields = {
  name: '',
  address: '',
  phone: '',
  email: '',
  contactName: '',
  notes: '',
};

const field =
  'rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900';

/**
 * Create or edit a venue. With a `venueId` it PATCHes an existing venue;
 * without one it POSTs a new venue for the band. Save and Cancel both return
 * to the band's Venues tab.
 */
export function VenueForm({
  bandId,
  venueId,
  bandName,
  initial,
}: {
  bandId: string;
  /** Present → edit mode; absent → create mode. */
  venueId?: string;
  bandName: string;
  initial: VenueFields;
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const canGoBack = useCanGoBack();

  const [fields, setFields] = useState<VenueFields>(initial);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof VenueFields, v: string) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  const venuesHref = `/bands/${bandId}?tab=venues`;
  const isEdit = Boolean(venueId);

  // `router.refresh()` on every exit: back/forward navigations are served from
  // the client Router Cache without re-requesting server components, so the
  // page behind would render its pre-edit payload and look as though the save
  // hadn't taken.
  const leave = () => {
    router.refresh();
    if (canGoBack()) router.back();
    else router.push(venuesHref);
  };

  const canSave = Boolean(fields.name.trim() && !busy);

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const r = await fetch(
          isEdit
            ? `/api/bands/${bandId}/venues/${venueId}`
            : `/api/bands/${bandId}/venues`,
          {
            method: isEdit ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields),
          },
        );
        await ensureOk(r);
      });
      showToast(isEdit ? 'Venue saved.' : 'Venue created.', 'success');
      router.refresh();
      router.push(venuesHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={leave} className="btn-outline">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="btn-primary"
        >
          {busy ? 'Saving…' : isEdit ? 'Save' : 'Create venue'}
        </button>
      </div>

      <h1 className="title-text">{isEdit ? 'Edit venue' : 'New venue'}</h1>
      <p className="text-sm text-neutral-500">{bandName}</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="venue-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="venue-name"
          value={fields.name}
          onChange={(e) => set('name', e.target.value)}
          maxLength={255}
          autoFocus
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="venue-address" className="text-sm font-medium">
          Address
        </label>
        <input
          id="venue-address"
          value={fields.address}
          onChange={(e) => set('address', e.target.value)}
          maxLength={500}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="venue-phone" className="text-sm font-medium">
            Phone number
          </label>
          <input
            id="venue-phone"
            type="tel"
            value={fields.phone}
            onChange={(e) => set('phone', e.target.value)}
            maxLength={50}
            className={field}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="venue-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="venue-email"
            type="email"
            value={fields.email}
            onChange={(e) => set('email', e.target.value)}
            maxLength={255}
            className={field}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="venue-contact" className="text-sm font-medium">
          Contact name
        </label>
        <input
          id="venue-contact"
          value={fields.contactName}
          onChange={(e) => set('contactName', e.target.value)}
          maxLength={255}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="venue-notes" className="text-sm font-medium">
          Notes
        </label>
        <textarea
          id="venue-notes"
          value={fields.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={5}
          maxLength={5000}
          className={`${field} resize-y`}
        />
      </div>
    </div>
  );
}
