import Link from 'next/link';

/**
 * 404 — reached both by unknown URLs and by every `notFound()` call in the
 * app, which is how a page refuses a band, song, or event the viewer isn't a
 * member of. The copy covers both without claiming which: telling someone a
 * setlist exists but isn't theirs is more than they should learn from a URL.
 */
export default function NotFound() {
  return (
    <main className="main-container">
      <div className="mt-10 flex flex-col items-center gap-4 rounded-lg border border-neutral-200 px-4 py-10 text-center dark:border-neutral-800">
        <h1 className="title-text">Not found</h1>
        <p className="max-w-sm text-sm text-neutral-500">
          This page doesn’t exist, or it belongs to a band you’re not in.
        </p>
        <Link href="/home" className="btn-primary">
          Go home
        </Link>
      </div>
    </main>
  );
}
