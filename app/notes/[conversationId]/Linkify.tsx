import { Fragment, type ReactNode } from 'react';

/**
 * Render plain text with bare http(s) URLs turned into clickable links
 * and `@mentions` of known participants styled.
 *
 * Deliberately minimal — this is NOT a markdown renderer. It autolinks
 * absolute http/https URLs (the shape produced by "Copy link to
 * thread", plus pasted links) and highlights `@Display Name` runs that
 * match a `mentionLabels` entry. Everything else renders as-is, so the
 * surrounding `whitespace-pre-wrap` still preserves newlines/spacing.
 *
 * Mentions are matched against the known participant labels (rather than
 * a naive `@word` regex) so multi-word display names like "@Jane Doe"
 * highlight in full. The functional side of mentions — notifications —
 * relies on each note's structured `mentions` array, not on this render
 * pass, so an unmatched label is only ever a cosmetic miss.
 */

const URL_RE = /(https?:\/\/[^\s<]+)/g;
const TRAILING_PUNCT_RE = /[).,;:!?'"\]]+$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function Linkify({
  text,
  mentionLabels = [],
}: {
  text: string;
  /** Known participant display labels, for highlighting `@label`. */
  mentionLabels?: string[];
}): ReactNode {
  // First split out mentions (longest label first so "@Jane Doe" wins
  // over "@Jane"), then URL-linkify the remaining text segments.
  const labels = [...new Set(mentionLabels.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  const mentionRe =
    labels.length > 0
      ? new RegExp(`@(?:${labels.map(escapeRegExp).join('|')})`, 'g')
      : null;

  const out: ReactNode[] = [];
  let key = 0;

  if (!mentionRe) {
    return <>{linkifyUrls(text, () => key++)}</>;
  }

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  mentionRe.lastIndex = 0;
  while ((match = mentionRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(
        ...linkifyUrls(text.slice(lastIndex, match.index), () => key++),
      );
    }
    out.push(
      <span
        key={key++}
        className="rounded bg-blue-100 px-1 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      >
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push(...linkifyUrls(text.slice(lastIndex), () => key++));
  }

  return <>{out}</>;
}

/** Turn bare http(s) URLs in a plain string into anchor nodes. */
function linkifyUrls(text: string, nextKey: () => number): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    const matchStart = match.index;
    const raw = match[0];

    // Pull trailing punctuation back out of the URL so it renders as
    // surrounding text rather than part of the link.
    const trailingMatch = raw.match(TRAILING_PUNCT_RE);
    const trailing = trailingMatch ? trailingMatch[0] : '';
    const url = trailing ? raw.slice(0, raw.length - trailing.length) : raw;

    if (matchStart > lastIndex) {
      parts.push(
        <Fragment key={nextKey()}>{text.slice(lastIndex, matchStart)}</Fragment>,
      );
    }
    parts.push(
      <a
        key={nextKey()}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
      >
        {url}
      </a>,
    );
    if (trailing) {
      parts.push(<Fragment key={nextKey()}>{trailing}</Fragment>);
    }
    lastIndex = matchStart + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={nextKey()}>{text.slice(lastIndex)}</Fragment>);
  }

  return parts;
}
