'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureOk } from '@/lib/api';
import { PageHeader } from '../../../PageHeader';
import { Select } from '../../../Select';
import { AutoTextarea } from '@/app/AutoTextarea';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { NoteLinkModal } from '../notes/NoteLinkModal';
import { noteLinkBadge } from '@/lib/note-links';
import type { NoteLinkInput } from '@/lib/db/user-notes';
import type { TodoStatus } from '@/lib/db/todos';

const field =
  'rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900';

export interface BandMemberOption {
  id: string;
  name: string;
}

/**
 * Create or edit a todo.
 *
 * Sharing isn't here. It has rules of its own — only the creator or the owner
 * may take a todo back out of the band — so it lives on the row's menu and
 * its own endpoint, and an ordinary edit can't quietly do it. New todos get a
 * Share toggle because at that point there's nothing to take away from
 * anyone.
 */
export function TodoForm({
  bandId,
  todoId,
  members,
  initial,
}: {
  bandId: string;
  /** Omitted when creating. */
  todoId?: string;
  /** Band members, for assigning a shared todo. */
  members: BandMemberOption[];
  initial?: {
    title: string;
    description: string;
    status: TodoStatus;
    shared: boolean;
    ownerId: string | null;
    deadline: string | null;
    links: NoteLinkInput[];
  };
}) {
  const router = useRouter();
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<TodoStatus>(initial?.status ?? 'active');
  const [shared, setShared] = useState(initial?.shared ?? false);
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? '');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [links, setLinks] = useState<NoteLinkInput[]>(initial?.links ?? []);
  const [linkOpen, setLinkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const backHref = `/bands/${bandId}?tab=todos`;
  /**
   * Where saving lands you: the view this todo is actually in.
   *
   * A private todo isn't in All, and All is the default — so returning to the
   * bare tab after creating one shows a list it isn't in, which reads as the
   * save having failed.
   */
  const savedHref = (isShared: boolean) =>
    `${backHref}&todos=${isShared ? 'all' : 'mine'}`;
  const canSave = Boolean(title.trim() && !busy);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(
          todoId
            ? `/api/bands/${bandId}/todos/${todoId}`
            : `/api/bands/${bandId}/todos`,
          {
            method: todoId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(),
              description,
              status,
              // Only sent when creating; editing goes through ./share.
              ...(todoId ? {} : { shared }),
              ownerId: ownerId || null,
              deadline: deadline || null,
              links,
            }),
          },
        );
        await ensureOk(res, [200, 201]);
      });
      showToast(todoId ? 'Todo saved.' : 'Todo created.', 'success');
      // On an edit the sharing hasn't changed here — it can't, this form
      // doesn't offer it — so `initial.shared` is still true of the todo.
      router.push(savedHref(todoId ? (initial?.shared ?? false) : shared));
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // Assigning only means something once the band can see it.
  const canAssign = todoId ? initial?.shared === true : shared;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader defaultHref={backHref} defaultHrefName="Todos" />

      <div className="flex items-center justify-between gap-2">
        <h1 className="title-text">{todoId ? 'Edit todo' : 'New todo'}</h1>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="shrink-0 btn-primary"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="todo-title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="todo-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="todo-description" className="text-sm font-medium">
          Description
        </label>
        <AutoTextarea
          id="todo-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${field} min-h-24`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="todo-deadline" className="text-sm font-medium">
          Deadline
        </label>
        <input
          id="todo-deadline"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className={field}
        />
        <p className="text-[0.6875rem] minor-text-theme-colors">
          Optional. An active todo past its deadline is flagged in the list.
        </p>
      </div>

      {todoId && (
        <div className="flex flex-col gap-1">
          <label htmlFor="todo-status" className="text-sm font-medium">
            Status
          </label>
          <Select
            id="todo-status"
            value={status}
            onChange={(v) => setStatus(v as TodoStatus)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'complete', label: 'Complete' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>
      )}

      {canAssign && (
        <div className="flex flex-col gap-1">
          <label htmlFor="todo-owner" className="text-sm font-medium">
            Owner
          </label>
          <Select
            id="todo-owner"
            value={ownerId}
            onChange={setOwnerId}
            placeholder="Unassigned"
            options={[
              { value: '', label: 'Unassigned' },
              ...members.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
          <p className="text-[0.6875rem] minor-text-theme-colors">
            Who’s doing it. Anyone in the band can pick this up or hand it on.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Links</span>
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="btn-outline"
          >
            Add link
          </button>
        </div>
        {links.length > 0 && (
          <ul className="flex flex-col gap-1">
            {links.map((l, i) => (
              <li
                key={`${l.kind}-${l.targetId ?? l.url}-${i}`}
                className="flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800"
              >
                <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide minor-text-theme-colors dark:bg-neutral-900">
                  {noteLinkBadge(l)}
                </span>
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                <button
                  type="button"
                  onClick={() =>
                    setLinks((prev) => prev.filter((_, j) => j !== i))
                  }
                  aria-label={`Remove ${l.label}`}
                  className="shrink-0 px-1 minor-text-theme-colors hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!todoId && (
        <label className="flex items-start gap-3 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => {
              setShared(e.target.checked);
              // Sharing puts it up for grabs; an owner on a private todo
              // could only ever be its creator.
              if (!e.target.checked) setOwnerId('');
            }}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium">Make visible to band</span>
            <span className="block text-[0.6875rem] minor-text-theme-colors">
              Off by default — only you can see this. Sharing lets anyone in the
              band edit it, pick it up, or mark it done.
            </span>
          </span>
        </label>
      )}

      {linkOpen && (
        <NoteLinkModal
          bandId={bandId}
          onAdd={(link) => {
            setLinks((prev) => [...prev, link]);
            setLinkOpen(false);
          }}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </div>
  );
}
