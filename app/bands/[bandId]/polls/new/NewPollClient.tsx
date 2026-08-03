'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { useTrackPending } from '../../../../PendingActionProvider';
import { useToast } from '../../../../ToastProvider';

interface OptionRow {
  id: string;
  text: string;
}

const field =
  'rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;

/**
 * Create a poll: a title, an optional description, and two or more options
 * (add/remove freely). "Create poll" saves it and notifies the band.
 */
export function NewPollClient({ bandId }: { bandId: string }) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<OptionRow[]>([
    { id: uid(), text: '' },
    { id: uid(), text: '' },
  ]);
  const [busy, setBusy] = useState(false);

  const nonEmpty = options.filter((o) => o.text.trim()).length;
  const canCreate = Boolean(title.trim() && nonEmpty >= 2 && !busy);

  const setOption = (id: string, text: string) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  const addOption = () =>
    setOptions((prev) => [...prev, { id: uid(), text: '' }]);
  const removeOption = (id: string) =>
    setOptions((prev) =>
      prev.length <= 2 ? prev : prev.filter((o) => o.id !== id),
    );

  const handleCreate = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const id = await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/polls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            options: options.map((o) => o.text),
          }),
        });
        await ensureOk(r);
        const data = (await r.json()) as { id: string };
        return data.id;
      });
      showToast('Poll created.', 'success');
      router.push(`/bands/${bandId}/polls/${id}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="title-text">New poll</h1>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate}
          className="shrink-0 btn-primary"
        >
          {busy ? 'Creating…' : 'Create poll'}
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
                className="shrink-0 rounded px-2 py-1 text-neutral-400 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
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
    </div>
  );
}
