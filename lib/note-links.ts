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

/**
 * A pasted `other` link as something a browser can open, or null when it can't
 * be made into one.
 *
 * `other` is the outside-link category, so anything filed under it is treated
 * as a destination — no guessing about whether it "looks like" a URL. The
 * scheme is optional because that's what people actually type: `example.com`
 * and `www.example.com/tour` are links, and requiring `https://` meant they
 * rendered as dead plain text.
 *
 * Resolved at read time rather than on save, so links stored before this
 * existed start working with no data migration.
 *
 * Two things are still refused, and both are deliberate:
 *
 *   - `javascript:`, `data:`, `vbscript:` — the value is user-supplied and
 *     goes straight into an href, so these are a script-injection route. Any
 *     other explicit scheme is refused too, which keeps the guarantee simple:
 *     what comes out of here is always http(s).
 *   - Anything the URL parser can't make sense of, e.g. text with spaces.
 *     There's nothing to navigate to, so the chip stays plain text.
 */
export function externalNoteUrl(raw: string | null): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  /**
   * Whitespace means it isn't an address, and this has to be decided here
   * rather than left to `new URL`: Chromium percent-encodes a space in the
   * host (`shelf 4B` becomes `https://shelf%204b/`) where Node throws. This
   * function runs in the browser, so relying on the constructor to reject it
   * passed in tests and produced a dead link in the app.
   */
  if (/\s/.test(text)) return null;

  // The negative lookahead matters: `localhost:3000` is a host and a port, not
  // a scheme, and without it every `host:port` was refused as an unknown one.
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text);
  if (hasScheme && !/^https?:\/\//i.test(text)) return null;

  /**
   * Digits and dots alone are silently reinterpreted as an IP address —
   * `3.5` becomes `3.0.0.5` — which is a parser quirk, not something anyone
   * typed. A real IPv4 has four parts and is left alone.
   */
  if (/^[\d.]+$/.test(text) && text.split('.').length !== 4) return null;

  try {
    const u = new URL(hasScheme ? text : `https://${text}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
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
