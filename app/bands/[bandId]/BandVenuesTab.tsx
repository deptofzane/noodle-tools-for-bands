'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useNavigate } from '../../useNavigate';
import { ensureOk } from '@/lib/api';
import {
  ActionMenu,
  ActionMenuItem,
  MenuIconRow,
  MenuSectionLabel,
} from '../../ActionMenu';
import { EyeIcon, LinkIcon, PencilIcon } from '../../icons';
import { useShareLink } from '../../useShareLink';
import { venueHref } from '@/lib/routes';
import { ConfirmModal } from '../../ConfirmModal';
import { usePersistedBoolean } from '../../usePersistedBoolean';
import { usePersistedStringSet } from '../../usePersistedStringSet';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { MinimizeToggle, type Venue } from './bandDetailShared';
import { MapLink } from '../../MapLink';

/**
 * The Venues tab: the band's saved venues (each expandable to reveal its
 * contact details and notes), plus a Create button. Each venue has a kebab to
 * edit or delete it. Owns its own collapse state; the parent supplies the data
 * and a reload callback.
 */
export function BandVenuesTab({
  bandId,
  venues,
  onReload,
}: {
  bandId: string;
  venues: Venue[];
  onReload: () => Promise<void> | void;
}) {
  const go = useNavigate();
  const share = useShareLink();
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [expanded, toggleExpanded] = usePersistedStringSet(
    `bandVenuesExpanded:${bandId}`,
  );
  const [venuesMinimized, setVenuesMinimized] = usePersistedBoolean(
    'bandVenuesMinimized',
    false,
  );
  const [deleteTarget, setDeleteTarget] = useState<Venue | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const r = await fetch(
          `/api/bands/${bandId}/venues/${deleteTarget.id}`,
          { method: 'DELETE' },
        );
        await ensureOk(r, [204]);
      });
      showToast('Venue deleted.', 'success');
      setDeleteTarget(null);
      await onReload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const renderVenue = (venue: Venue) => {
    const collapsed = !expanded.has(venue.id);
    const hasDetails = Boolean(
      venue.address ||
      venue.phone ||
      venue.email ||
      venue.contactName ||
      venue.notes,
    );
    return (
      <li
        key={venue.id}
        className="rounded-lg border border-neutral-200 dark:border-neutral-800"
      >
        <div className="flex items-center gap-1 pr-1">
          <button
            type="button"
            onClick={() => toggleExpanded(venue.id)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand venue' : 'Minimize venue'}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="text-sm leading-none text-neutral-400"
              >
                {collapsed ? '▸' : '▾'}
              </span>
              <span className="truncate text-sm font-medium">{venue.name}</span>
            </span>
          </button>
          <ActionMenu label={`Actions for ${venue.name}`}>
            <MenuSectionLabel>Venue</MenuSectionLabel>
            <MenuIconRow
              items={[
                {
                  key: 'view',
                  icon: <EyeIcon size={18} />,
                  label: `View ${venue.name}`,
                  title: 'View venue',
                  onClick: () => go(venueHref(bandId, venue.id)),
                },
                {
                  key: 'edit',
                  icon: <PencilIcon size={18} />,
                  label: `Edit ${venue.name}`,
                  title: 'Edit venue',
                  onClick: () => go(`/bands/${bandId}/venues/${venue.id}/edit`),
                },
                {
                  key: 'share',
                  icon: <LinkIcon size={18} />,
                  label: `Copy a link to ${venue.name}`,
                  title: 'Share venue',
                  onClick: () =>
                    void share(venueHref(bandId, venue.id), 'Venue'),
                },
              ]}
            />
            <ActionMenuItem destructive onClick={() => setDeleteTarget(venue)}>
              Delete venue
            </ActionMenuItem>
          </ActionMenu>
        </div>
        {!collapsed && (
          <div className="flex flex-col gap-1 border-t border-neutral-200 px-4 py-3 text-sm md:px-3 dark:border-neutral-800">
            {hasDetails ? (
              <>
                {venue.address && (
                  <div>
                    <span className="font-medium">Address:</span>{' '}
                    <MapLink address={venue.address} />
                  </div>
                )}
                {venue.phone && (
                  <div>
                    <span className="font-medium">Phone:</span>{' '}
                    <a
                      href={`tel:${venue.phone}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {venue.phone}
                    </a>
                  </div>
                )}
                {venue.email && (
                  <div>
                    <span className="font-medium">Email:</span>{' '}
                    <a
                      href={`mailto:${venue.email}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {venue.email}
                    </a>
                  </div>
                )}
                {venue.contactName && (
                  <div>
                    <span className="font-medium">Contact:</span>{' '}
                    {venue.contactName}
                  </div>
                )}
                {venue.notes && (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">Notes:</span>
                    <p className="whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
                      {venue.notes}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="minor-text-theme-colors">No details saved.</p>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <MinimizeToggle
            minimized={venuesMinimized}
            onToggle={() => setVenuesMinimized((v) => !v)}
            label="Venues"
          >
            <h2 className="text-sm font-medium">Venues</h2>
          </MinimizeToggle>
          <Link href={`/bands/${bandId}/venues/new`} className="btn-outline">
            Create venue
          </Link>
        </div>
        {!venuesMinimized &&
          (venues.length > 0 ? (
            <ul className="flex flex-col gap-2">{venues.map(renderVenue)}</ul>
          ) : (
            <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
              No venues yet. Use “Create venue” to add one.
            </p>
          ))}
      </section>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete venue?"
        description={`This permanently deletes “${deleteTarget?.name ?? ''}”. This can’t be undone.`}
        confirmLabel="Delete venue"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
