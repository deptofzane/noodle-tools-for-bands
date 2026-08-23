'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ConfirmModal } from '../../../ConfirmModal';
import { externalNoteUrl, noteLinkBadge, noteLinkHref } from '@/lib/note-links';
import type { NoteLink } from '@/lib/db/user-notes';

/** A note's link as a chip — a link when it leads somewhere, text when it doesn't. */
function LinkChip({
  link,
  bandId,
  onExternal,
}: {
  link: NoteLink;
  bandId: string;
  /** Asked to confirm before leaving the app. */
  onExternal: (url: string) => void;
}) {
  const href = noteLinkHref(link, bandId);
  // `other` links are free text; this is what decides whether one is openable
  // and supplies the scheme when the author didn't type one.
  const externalUrl = link.kind === 'other' ? externalNoteUrl(href) : null;
  const external = externalUrl !== null;
  const inner = (
    <>
      <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide minor-text-theme-colors dark:bg-neutral-900">
        {noteLinkBadge(link)}
      </span>
      <span className="truncate">{link.label}</span>
    </>
  );
  const shell =
    'flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800';

  // `other` holds whatever was pasted, which may not be a URL at all.
  if (!href || (link.kind === 'other' && !external))
    return <span className={shell}>{inner}</span>;
  if (external)
    return (
      // Still a real anchor, not a button: right-click "copy link address" and
      // middle-click keep working, and those bypass the prompt deliberately —
      // someone doing either has already said where they're going.
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onExternal(externalUrl);
        }}
        className={`${shell} hover:bg-neutral-50 dark:hover:bg-neutral-900`}
      >
        {inner}
      </a>
    );
  return (
    <Link
      href={href}
      className={`${shell} hover:bg-neutral-50 dark:hover:bg-neutral-900`}
    >
      {inner}
    </Link>
  );
}

/**
 * A note's links, with the leaving-the-app prompt they need.
 *
 * Its own component because two screens render the same chips — the Notes tab
 * and the note's own page — and the confirmation below is the sort of thing
 * that gets left out of a second copy. Owning the modal here means a caller
 * can't render the chips without it.
 */
export function NoteLinks({
  links,
  bandId,
  className = 'flex flex-wrap gap-1.5',
}: {
  links: NoteLink[];
  bandId: string;
  className?: string;
}) {
  // One modal for the whole set rather than one per chip — only one link can
  // be being confirmed at a time.
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  if (links.length === 0) return null;

  return (
    <>
      <div className={className}>
        {links.map((l) => (
          <LinkChip
            key={l.id}
            link={l}
            bandId={bandId}
            onExternal={setExternalUrl}
          />
        ))}
      </div>

      {/*
        Leaving the app is worth a beat's confirmation: a note's links are
        pasted by a bandmate, and in the installed app a tap otherwise hands
        the screen to a site with no address bar explaining where you went.

        `window.open` covers both cases the same way — a new tab in a browser,
        and the system browser from the installed app, because the destination
        is cross-origin and so isn't captured back into the app's scope. It's
        called straight from the confirm click, so it counts as a user gesture
        and isn't treated as a popup.
      */}
      <ConfirmModal
        open={externalUrl !== null}
        title="Open this link?"
        description={`Are you sure you want to open this link to ${externalUrl ?? ''}?`}
        confirmLabel="Open link"
        onConfirm={() => {
          if (externalUrl)
            window.open(externalUrl, '_blank', 'noopener,noreferrer');
          setExternalUrl(null);
        }}
        onCancel={() => setExternalUrl(null)}
      />
    </>
  );
}
