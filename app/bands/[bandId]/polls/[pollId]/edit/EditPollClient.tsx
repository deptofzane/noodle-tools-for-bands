'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { ConfirmModal } from '../../../../../ConfirmModal';
import { useTrackPending } from '../../../../../PendingActionProvider';
import { useToast } from '../../../../../ToastProvider';

interface OptionRow {
  id: string;
  text: string;
}

const field =
  'rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;

/**
 * Edit a poll's title, description, and options, or close/cancel it. Existing
 * options keep their id (and votes); newly-added ones get a client id.
 * Closing archives the poll (stops voting, keeps it for history); cancelling
 * deletes it. Both ask for confirmation and notify the band.
 */
export function EditPollClient({
  bandId,
  pollId,
  initialTitle,
  initialDescription,
  initialOptions,
}: {
  bandId: string;
  pollId: string;
  initialTitle: string;
  initialDescription: string;
  initialOptions: { id: string; text: string }[];
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [options, setOptions] = useState<OptionRow[]>(initialOptions);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const pollHref = `/bands/${bandId}/polls/${pollId}`;
  const nonEmpty = options.filter((o) => o.text.trim()).length;
  const canSave = Boolean(title.trim() && nonEmpty >= 2 && !busy);

  const setOption = (id: string, text: string) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  const addOption = () =>
    setOptions((prev) => [...prev, { id: uid(), text: '' }]);
  const removeOption = (id: string) =>
    setOptions((prev) =>
      prev.length <= 2 ? prev : prev.filter((o) => o.id !== id),
    );

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/polls/${pollId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            // Send the real id for existing options (so their votes survive);
            // omit it for new ones.
            options: options.map((o) =>
              o.id.startsWith('tmp-')
                ? { text: o.text }
                : { id: o.id, text: o.text },
            ),
          }),
        });
        await ensureOk(r);
      });
      showToast('Poll updated.', 'success');
      router.replace(pollHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const handleCancelPoll = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/polls/${pollId}`, {
          method: 'DELETE',
        });
        await ensureOk(r, [204]);
      });
      showToast('Poll cancelled.', 'success');
      // `replace`: Back must not return to an editor for something now deleted.
      router.replace(`/bands/${bandId}?tab=polls`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setCancelling(false);
      setCancelOpen(false);
    }
  };

  const handleClosePoll = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/polls/${pollId}/close`, {
          method: 'POST',
        });
        await ensureOk(r, [204]);
      });
      showToast('Poll closed.', 'success');
      router.replace(pollHref);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setClosing(false);
      setCloseOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="title-text">Edit poll</h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="shrink-0 btn-primary"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="poll-title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="poll-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          placeholder="What’s the question?"
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="poll-description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="poll-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional context for the poll…"
          className={field}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Options</span>
        <ul className="flex flex-col gap-2">
          {options.map((o, i) => (
            <li key={o.id} className="flex items-center gap-2">
              <input
                value={o.text}
                onChange={(e) => setOption(o.id, e.target.value)}
                maxLength={255}
                placeholder={`Option ${i + 1}`}
                aria-label={`Option ${i + 1}`}
                className={`${field} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => removeOption(o.id)}
                disabled={options.length <= 2}
                aria-label={`Remove option ${i + 1}`}
                className="shrink-0 rounded px-2 py-1 text-neutral-400 hover:text-danger disabled:opacity-30"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addOption}
          className="self-start btn-outline"
        >
          Add option
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCloseOpen(true)}
          className="self-start btn-outline"
        >
          Close poll
        </button>
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="self-start rounded-md border border-red-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-danger hover:bg-danger-fill dark:border-red-800"
        >
          Cancel poll
        </button>
      </div>

      <ConfirmModal
        open={closeOpen}
        title="Close this poll?"
        description="This stops voting and archives the poll with its current results. It stays viewable in history but can’t be reopened."
        confirmLabel="Close poll"
        busyLabel="Closing…"
        busy={closing}
        onConfirm={handleClosePoll}
        onCancel={() => setCloseOpen(false)}
      />

      <ConfirmModal
        open={cancelOpen}
        title="Cancel this poll?"
        description="This permanently deletes the poll and its votes, and notifies the band. This can’t be undone."
        confirmLabel="Cancel poll"
        busyLabel="Cancelling…"
        busy={cancelling}
        onConfirm={handleCancelPoll}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  );
}
