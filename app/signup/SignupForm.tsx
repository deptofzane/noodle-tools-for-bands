'use client';

import { ensureOk } from '@/lib/api';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

const field =
  'rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900';

export function SignupForm({
  initialEmail = '',
  callbackUrl = '/home',
}: {
  initialEmail?: string;
  callbackUrl?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email || password.length < 8) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      await ensureOk(r);
      // Account created — sign them in.
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        // Created but auto-login failed — send them to login (keep intent).
        router.push(
          `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
        );
        return;
      }
      // Let the header's band picker refresh (invites may have added a band).
      window.dispatchEvent(new Event('bands:changed'));
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (optional)"
        autoComplete="name"
        className={field}
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="email"
        className={field}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (min 8 characters)"
        autoComplete="new-password"
        minLength={8}
        className={field}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email || password.length < 8}
        className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
