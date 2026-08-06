'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { ensureOk } from '@/lib/api';
import { Modal } from '../Modal';
import { LoadingBlock } from '../Spinner';
import { useToast } from '../ToastProvider';

interface Plan {
  bandsDeleted: { id: string; name: string }[];
  bandsLeft: { id: string; name: string }[];
  personalNotesDeleted: number;
}

/**
 * "Delete account", with the consequences spelled out before the confirmation.
 *
 * The plan is fetched when the dialog opens rather than up front: it's a
 * couple of queries that only matter to someone who has decided to look, and
 * the numbers should be current at the moment they read them.
 *
 * Confirmation is typing the account's email. Bands they solely own are named
 * explicitly, because those disappear for everyone in them — that's the part
 * nobody should discover afterwards.
 */
export function DeleteAccount({ email }: { email: string | null }) {
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPlan(null);
    setPlanError(null);
    void (async () => {
      try {
        const res = await fetch('/api/account', { cache: 'no-store' });
        await ensureOk(res);
        const data = (await res.json()) as Plan;
        if (!cancelled) setPlan(data);
      } catch (e) {
        if (!cancelled)
          setPlanError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
  };

  const confirm = async () => {
    if (busy || !typed.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: typed }),
      });
      await ensureOk(res);
      // Straight out — the session now points at a scrubbed row, so there's
      // nothing left to render behind this.
      await signOut({ callbackUrl: '/login' });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-red-300 p-4 dark:border-red-900">
      <p className="font-medium text-red-700 dark:text-red-400">
        Delete account
      </p>
      <p className="mt-1 text-xs minor-text-theme-colors dark:text-neutral-400">
        Permanently removes your account and everything personal to it. Any band
        you’re the only owner of is deleted too, along with its songs and files
        — for everyone in it. This can’t be undone.
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-red-300 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 md:px-3 md:py-1.5 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete account
        </button>
      </div>

      {open && (
        <Modal
          onClose={close}
          busy={busy}
          labelledBy="delete-account-title"
          size="md"
        >
          <h2
            id="delete-account-title"
            className="text-base font-semibold text-red-700 dark:text-red-400"
          >
            Delete your account?
          </h2>

          {planError ? (
            <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
              {planError}
            </p>
          ) : plan === null ? (
            <LoadingBlock size="sm" className="py-8" label="Checking bands" />
          ) : (
            <div className="mt-4 flex flex-col gap-3 text-sm">
              {plan.bandsDeleted.length > 0 && (
                <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950">
                  <p className="font-medium text-red-800 dark:text-red-200">
                    These bands will be deleted for everyone:
                  </p>
                  <ul className="mt-1 list-inside list-disc text-red-800 dark:text-red-200">
                    {plan.bandsDeleted.map((b) => (
                      <li key={b.id} className="truncate">
                        {b.name}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                    You’re their only owner, so their songs, setlists, events
                    and files go with them.
                  </p>
                </div>
              )}

              {plan.bandsLeft.length > 0 && (
                <p className="text-neutral-600 dark:text-neutral-400">
                  You’ll be removed from{' '}
                  <span className="font-medium">
                    {plan.bandsLeft.map((b) => b.name).join(', ')}
                  </span>
                  . They keep everything shared.
                </p>
              )}

              <p className="text-neutral-600 dark:text-neutral-400">
                Your {plan.personalNotesDeleted} personal note
                {plan.personalNotesDeleted === 1 ? '' : 's'}, votes and
                preferences are deleted. Comments you left on songs stay, shown
                as “Deleted account”.
              </p>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="confirm-email"
                  className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                >
                  Type {email ? <b>{email}</b> : 'your email address'} to
                  confirm
                </label>
                <input
                  id="confirm-email"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  disabled={busy}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy || !typed.trim() || plan === null}
              className="rounded-md bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 md:px-3 md:py-1.5"
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
