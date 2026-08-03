import type {
  NoteLink,
  NoteLinkInput,
  NoteLinkKind,
} from '@/lib/db/user-notes';

/** The kinds a note can point at, in the order the picker offers them. */
export const NOTE_LINK_KINDS: { id: NoteLinkKind; label: string }[] = [
  { id: 'song', label: 'Song' },
  { id: 'event', label: 'Event' },
  { id: 'venue', label: 'Venue' },
  { id: 'setlist', label: 'Setlist' },
  { id: 'poll', label: 'Poll' },
  { id: 'other', label: 'Other' },
];

export function isNoteLinkKind(v: unknown): v is NoteLinkKind {
  return NOTE_LINK_KINDS.some((k) => k.id === v);
}

/** Where the band's list of a given kind is fetched from, for the picker. */
export function noteLinkListUrl(kind: NoteLinkKind, bandId: string): string {
  switch (kind) {
    case 'song':
      return `/api/bands/${bandId}/conversations`;
    case 'event':
      return `/api/bands/${bandId}/events`;
    case 'venue':
      return `/api/bands/${bandId}/venues`;
    case 'setlist':
      return `/api/bands/${bandId}/setlists`;
    case 'poll':
      return `/api/bands/${bandId}/polls`;
    case 'other':
      return '';
  }
}

/**
 * Where following a link goes. `other` is whatever the user pasted, which may
 * be an external URL or not a URL at all — callers render it as plain text
 * unless it parses as one.
 */
export function noteLinkHref(link: NoteLink, bandId: string): string | null {
  if (link.kind === 'other') return link.url;
  if (!link.targetId) return null;
  switch (link.kind) {
    case 'song':
      return `/notes/${link.targetId}`;
    case 'event':
      return `/calendar/events/${link.targetId}`;
    case 'venue':
      return `/bands/${bandId}/venues/${link.targetId}/edit`;
    case 'setlist':
      return `/bands/${bandId}/setlists/${link.targetId}`;
    case 'poll':
      return `/bands/${bandId}/polls/${link.targetId}`;
  }
}

const MAX_LINKS = 50;
const MAX_LABEL = 300;

/**
 * Validate a client's link list. Anything malformed is dropped rather than
 * failing the whole save — one bad link shouldn't cost someone their note.
 */
export function parseLinks(raw: unknown): NoteLinkInput[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteLinkInput[] = [];
  for (const item of raw.slice(0, MAX_LINKS)) {
    const l = item as Partial<NoteLinkInput>;
    if (!isNoteLinkKind(l.kind)) continue;
    const label = typeof l.label === 'string' ? l.label.trim() : '';
    if (!label || label.length > MAX_LABEL) continue;
    if (l.kind === 'other') {
      const url = typeof l.url === 'string' ? l.url.trim() : '';
      if (!url) continue;
      out.push({ kind: 'other', targetId: null, url, label });
      continue;
    }
    // Everything else names a row; without an id there's nothing to point at.
    const targetId = typeof l.targetId === 'string' ? l.targetId : '';
    if (!targetId) continue;
    out.push({ kind: l.kind, targetId, url: null, label });
  }
  return out;
}
