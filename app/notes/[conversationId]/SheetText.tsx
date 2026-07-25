'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  looksLikeChordPro,
  parseChordPro,
  type ChordToken,
} from '@/lib/chordpro';

type Mode = 'chords' | 'formatted' | 'source';

/**
 * Pick the default render mode. The saved extension is authoritative — text
 * sheet music is saved as `.chordpro` or `.md` to record the chosen format, so
 * Live / Practice / the panel open in that mode. Only legacy files with an
 * ambiguous extension (`.txt`, etc.) fall back to sniffing the content.
 */
function defaultMode(text: string, fileName: string): Mode {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (['cho', 'chopro', 'chordpro', 'pro', 'crd'].includes(ext)) return 'chords';
  if (['md', 'markdown'].includes(ext)) return 'formatted';
  if (['txt', 'text'].includes(ext)) return 'source'; // saved as plain source
  return looksLikeChordPro(text) ? 'chords' : 'formatted';
}

/** One lyric line: chords stacked over their text runs (aligned columns). */
function LyricLine({ tokens, chorus }: { tokens: ChordToken[]; chorus: boolean }) {
  const hasChords = tokens.some((t) => t.chord);
  return (
    <div
      className={
        'whitespace-nowrap ' +
        (chorus ? 'border-l-2 border-neutral-300 pl-2 dark:border-neutral-700' : '')
      }
    >
      {tokens.map((t, i) => (
        <span key={i} className="inline-flex flex-col align-bottom">
          {hasChords && (
            <span
              className="font-semibold leading-none text-cyan-600 dark:text-cyan-400"
              style={{ fontSize: '0.8em', height: '1.2em' }}
            >
              {t.chord ?? ' '}
            </span>
          )}
          <span className="whitespace-pre">{t.text || ' '}</span>
        </span>
      ))}
    </div>
  );
}

/** Render ChordPro text: directives, comments, and chord-over-lyric lines. */
function ChordChart({ text }: { text: string }) {
  const lines = parseChordPro(text);
  let chorus = false;
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (line.type === 'empty') {
      out.push(<div key={i} className="h-[0.8em]" />);
      return;
    }
    if (line.type === 'comment') {
      out.push(
        <div key={i} className="italic text-neutral-500 dark:text-neutral-400">
          {line.text}
        </div>,
      );
      return;
    }
    if (line.type === 'directive') {
      const { name, value } = line;
      if (name === 'start_of_chorus') {
        chorus = true;
        if (value)
          out.push(
            <div key={i} className="mt-2 text-[0.75em] font-semibold uppercase tracking-wide text-neutral-500">{value}</div>,
          );
        return;
      }
      if (name === 'end_of_chorus') {
        chorus = false;
        return;
      }
      if (name === 'title') {
        out.push(<div key={i} className="text-[1.4em] font-bold">{value}</div>);
        return;
      }
      if (name === 'subtitle' || name === 'artist' || name === 'composer') {
        out.push(<div key={i} className="text-[1.05em] text-neutral-600 dark:text-neutral-400">{value}</div>);
        return;
      }
      if (name.startsWith('start_of_')) {
        out.push(<div key={i} className="mt-2 text-[0.75em] font-semibold uppercase tracking-wide text-neutral-500">{value || name.replace('start_of_', '')}</div>);
        return;
      }
      if (name.startsWith('end_of_')) return;
      // key / capo / tempo / time and any other labelled directive.
      if (value)
        out.push(
          <div key={i} className="text-[0.8em] text-neutral-500">
            <span className="capitalize">{name}</span>: {value}
          </div>,
        );
      return;
    }
    out.push(<LyricLine key={i} tokens={line.tokens} chorus={chorus} />);
  });
  return (
    <div className="overflow-x-auto leading-[2.1em]">{out}</div>
  );
}

/**
 * Render text sheet music with light formatting. Auto-detects ChordPro vs
 * Markdown (with a manual override) and offers a raw Source view. Sizes are
 * em-relative so a parent `font-size` (e.g. the Live view's zoom) scales it.
 */
export function SheetText({
  text,
  fileName,
  controls = true,
}: {
  text: string;
  fileName: string;
  /** Show the Chords / Formatted / Source toggle. */
  controls?: boolean;
}) {
  const auto = useMemo(() => defaultMode(text, fileName), [text, fileName]);
  const [mode, setMode] = useState<Mode>(auto);
  // Re-sync when the underlying content changes (e.g. after an edit).
  useEffect(() => setMode(auto), [auto]);

  const body =
    mode === 'source' ? (
      <pre className="overflow-x-auto whitespace-pre rounded-md bg-neutral-50 p-3 font-mono text-[0.85em] dark:bg-neutral-900">
        {text}
      </pre>
    ) : mode === 'chords' ? (
      <ChordChart text={text} />
    ) : (
      <div className="sheet-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );

  if (!controls) return body;

  const MODES: { id: Mode; label: string }[] = [
    { id: 'chords', label: 'Chords' },
    { id: 'formatted', label: 'Formatted' },
    { id: 'source', label: 'Source' },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 self-end">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            className={
              'rounded-md px-2 py-0.5 text-xs font-medium ' +
              (mode === m.id
                ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100'
                : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800')
            }
          >
            {m.label}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}
