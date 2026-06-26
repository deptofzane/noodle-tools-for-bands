import { Fragment, type ReactNode } from 'react';

/**
 * Render plain text with bare http(s) URLs turned into clickable links.
 *
 * Deliberately minimal — this is NOT a markdown renderer. It only
 * autolinks absolute http/https URLs (the shape produced by the "Copy
 * link to thread" affordance, plus any links collaborators paste in).
 * Everything else is rendered as-is, so the surrounding
 * `whitespace-pre-wrap` still preserves newlines and spacing.
 *
 * Links open in a new tab. An in-app thread link loads the notes page
 * fresh, where the `?thread=` param scrolls to + highlights the target.
 */

// Match an absolute http(s) URL run. We grab a greedy non-space chunk
// and then trim trailing punctuation below, so "(see https://x/y)."
// links to "https://x/y" rather than swallowing the ")." .
const URL_RE = /(https?:\/\/[^\s<]+)/g;
const TRAILING_PUNCT_RE = /[).,;:!?'"\]]+$/;

export function Linkify({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
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
        <Fragment key={key++}>{text.slice(lastIndex, matchStart)}</Fragment>,
      );
    }
    parts.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
      >
        {url}
      </a>,
    );
    if (trailing) {
      parts.push(<Fragment key={key++}>{trailing}</Fragment>);
    }
    lastIndex = matchStart + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return <>{parts}</>;
}
