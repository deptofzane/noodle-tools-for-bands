'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureOk } from '@/lib/api';
import { formatDateShort, formatTimeRange } from '@/lib/format';
import { Modal } from '../Modal';
import { useToast } from '../ToastProvider';
import { completionInstant } from './eventTiming';
import type { UpcomingShow } from './UpcomingShows';
import { usePersistedBoolean } from '../usePersistedBoolean';
import { eventColorKey } from '../calendar/eventColors';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Events that finished within the last 24 hours, across the user's bands —
 * shown above Upcoming so a just-played show is still one tap away. Windowed
 * against the viewer's own clock (computed on mount, so there's no
 * server/client hydration mismatch), and starts minimized. Renders nothing
 * when there's nothing recent.
 *
 * Each of the viewer's own band events gets an "Add/Edit notes" button that
 * opens a modal to jot down the band's private observations. `bandIds` is the
 * viewer's band memberships — the button is hidden for events they only attend
 * as a guest, since notes are band-private.
 */
export function RecentEvents({
  shows,
  bandIds,
}: {
  shows: UpcomingShow[];
  bandIds: string[];
}) {
  const showToast = useToast();
  // Minimized by default, but the choice sticks across visits.
  const [open, setOpen] = usePersistedBoolean('homeRecentEventsOpen', false);
  const [now, setNow] = useState<number | null>(null);

  // The event whose notes are being edited, plus modal state.
  const [target, setTarget] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const canManage = new Set(bandIds);

  const openNotes = async (s: UpcomingShow) => {
    setTarget({ id: s.id, title: s.title });
    setNotes('');
    setLoading(true);
    try {
      const r = await fetch(`/api/events/${s.id}/notes`, { cache: 'no-store' });
      await ensureOk(r);
      const d = (await r.json()) as { notes: string | null };
      setNotes(d.notes ?? '');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setTarget(null);
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = async () => {
    if (!target || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/events/${target.id}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      await ensureOk(r);
      showToast('Notes saved.', 'success');
      setTarget(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (now === null) return null;

  const recent = shows
    .map((s) => ({ s, end: completionInstant(s).getTime() }))
    .filter(({ end }) => end <= now && end > now - DAY_MS)
    .sort((a, b) => b.end - a.end) // most recently finished first
    .map(({ s }) => s);

  if (recent.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 self-start text-left"
      >
        <span
          aria-hidden="true"
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          {open ? '▾' : '▸'}
        </span>
        <h2 className="text-sm font-medium">Recent events</h2>
        <span className="text-xs minor-text-theme-colors">
          <span aria-hidden="true">·</span> last 24 hours · {recent.length}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {recent.map((s) => (
            <li
              key={s.id}
              data-event-type={eventColorKey(s.eventType)}
              className="flex items-center gap-1 border-l-[3px] border-l-[color:var(--event-accent)] bg-[color:var(--event-fill)] px-3 py-2.5"
            >
              <Link
                href={`/calendar/events/${s.id}`}
                className="-mx-1 flex min-w-0 flex-1 flex-col items-start justify-start gap-3 rounded px-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-[color:var(--event-accent)]">
                    {s.title}
                  </span>
                  <span className="truncate text-[0.6875rem] minor-text-theme-colors">
                    <span className="minor-text-band-theme-colors">
                      {s.bandName}
                    </span>
                    {s.location ? ` · ${s.location}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[0.6875rem] minor-text-theme-colors">
                  <span className="block font-medium text-neutral-700 dark:text-neutral-300">
                    {formatDateShort(s.date)}
                  </span>
                  {s.time && <span>{formatTimeRange(s.time, s.endTime)}</span>}
                </span>
              </Link>
              {canManage.has(s.bandId) && (
                <button
                  type="button"
                  onClick={() => void openNotes(s)}
                  className="ml-2 shrink-0 rounded-md border border-neutral-300 px-2.5 py-2 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  Add/Edit notes
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {target && (
        <Modal
          onClose={() => !saving && setTarget(null)}
          busy={saving}
          labelledBy="recent-notes-title"
          size="lg"
        >
          <h2 id="recent-notes-title" className="text-base font-semibold">
            Notes — {target.title}
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Only band members can see this.
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            maxLength={5000}
            disabled={loading || saving}
            autoFocus
            placeholder={loading ? 'Loading…' : 'Lay it on me.'}
            className="mt-3 w-full min-h-96 resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setTarget(null)}
              disabled={saving}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveNotes()}
              disabled={loading || saving}
              className="btn-primary"
            >
              {saving ? 'Saving…' : 'Save notes'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
