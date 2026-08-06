'use client';

import { useState } from 'react';
import Link from 'next/link';

const field =
  'rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true);
    // Fire-and-forget; the endpoint always 200s (no enumeration).
    await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setSent(true);
    setBusy(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <h3 className="mb-2 font-serif text-4xl">
        side<span className="text-cyan-600">stage</span>
      </h3>
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 p-8 dark:border-neutral-800">
        <h1 className="title-text">Reset password</h1>
        {sent ? (
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            If an account exists for that email, we&apos;ve sent a reset link.
            Check your inbox — it expires in 30 minutes.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className={field}
            />
            <button
              type="submit"
              disabled={busy || !email}
              className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="mt-4 text-xs minor-text-theme-colors">
          <Link href="/login" className="hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
