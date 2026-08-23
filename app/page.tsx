import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/**
 * The front door.
 *
 * Signed in, this is a pass-through to `/home` — which is what the installed
 * app relies on, since the manifest's `start_url` is `/` and every launch from
 * a home-screen icon comes through here. Landing those people on a sign-in
 * pitch would be the worst outcome of having a public root at all.
 *
 * Signed out, it says what this is and offers a way in, rather than throwing
 * an anonymous visitor straight at a login form. `/` is listed in
 * `PUBLIC_PATHS` (see middleware.ts) so they get this far; every other route
 * still redirects, carrying its `callbackUrl` so a shared link survives the
 * round-trip.
 *
 * Reading the session makes this dynamic, which it has to be: the same URL
 * gives two different answers, so it can't be prerendered or cached as one.
 */
export default async function RootPage() {
  const session = await auth();
  if (session) redirect('/home');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="font-serif text-5xl">
        noo<span className="text-cyan-600">dle</span>
      </h1>
      <p className="m-0 pb-6 text-sm minor-text-theme-colors">
        tools for<span className="text-cyan-600"> bands</span>
      </p>

      <p className="max-w-sm text-sm text-neutral-600 dark:text-neutral-400">
        Setlists, sheet music, and practice tools for your band — on stage and
        off.
      </p>

      <Link
        href="/login"
        className="mt-8 rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-500"
      >
        Log in
      </Link>

      {/* The three pages that are public for their own reasons (see
          middleware.ts) — and the ones someone deciding whether to sign up is
          most likely to want before they do. */}
      <nav className="mt-10 flex items-center gap-4 text-xs minor-text-theme-colors">
        <Link href="/about" className="hover:underline">
          About
        </Link>
        <Link href="/help" className="hover:underline">
          Help
        </Link>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </nav>
    </main>
  );
}
