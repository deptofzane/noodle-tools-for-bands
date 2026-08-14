import type { Metadata } from 'next';
import { HelpContent } from '../HelpContent';

export const metadata: Metadata = {
  title: 'Help',
  description: 'How Noodle works: bands, audio, setlists, and playing offline.',
};

/**
 * Help as its own page — the shareable, linkable form of the same text the
 * in-app dialog shows (see HelpDialog).
 *
 * Public, like `/about` and `/privacy`: someone who can't get past the login
 * screen is exactly the person most likely to need it, so this must not sit
 * behind the thing they're stuck on. Kept out of the auth redirect by
 * `PUBLIC_PATHS` in middleware.ts.
 */
export default function HelpPage() {
  return (
    <main className="main-container flex flex-col gap-8 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="title-text">Help</h1>
        <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          How Noodle fits together, and what to do when something doesn&rsquo;t.
        </p>
      </div>
      <HelpContent />
    </main>
  );
}
