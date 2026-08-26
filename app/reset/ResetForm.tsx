'use client';

import { ensureOk } from '@/lib/api';
import { useState } from 'react';
import Link from 'next/link';

const field =
  'rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <p className="mt-3 text-sm text-danger">
        This reset link is missing its token. Request a new one from{' '}
        <Link href="/forgot" className="underline">
          Forgot password
        </Link>
        .
      </p>
    );
  }

  if (done) {
    return (
      <p className="mt-3 text-sm text-fg-muted">
        Your password has been updated.{' '}
        <Link href="/login" className="underline">
          Sign in
        </Link>
        .
      </p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || password.length < 8) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      await ensureOk(r);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password (min 8 characters)"
        autoComplete="new-password"
        minLength={8}
        className={field}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy || password.length < 8}
        className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
