/** How to render a sheet-music file inline. */
export type PreviewKind = 'image' | 'pdf' | 'text' | 'other';

/** Format a pasted text sheet is saved as (drives the default render mode). */
export type SheetTextFormat = 'markdown' | 'chordpro' | 'source';

export const SHEET_TEXT_FORMATS: { id: SheetTextFormat; label: string }[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'chordpro', label: 'ChordPro' },
  { id: 'source', label: 'Source' },
];

/** The filename + MIME to save a pasted sheet under, encoding its format. */
export function sheetFormatFile(format: SheetTextFormat): {
  name: string;
  type: string;
} {
  if (format === 'chordpro')
    return { name: 'sheet-music.chordpro', type: 'text/plain' };
  if (format === 'source') return { name: 'sheet-music.txt', type: 'text/plain' };
  return { name: 'sheet-music.md', type: 'text/markdown' };
}

/**
 * Decide how to preview a file from its MIME type, with an extension
 * fallback. SVG is never inlined (scriptable). Shared by the sheet-music
 * panel and the full-screen Live view.
 */
export function previewKind(mime: string, fileName: string): PreviewKind {
  const m = (mime || '').toLowerCase();
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (m === 'image/svg+xml' || ext === 'svg') return 'other'; // never inline SVG
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext))
    return 'image';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    m.startsWith('text/') ||
    ['txt', 'md', 'markdown', 'csv', 'cho', 'chopro', 'chordpro', 'pro', 'crd'].includes(ext)
  )
    return 'text';
  return 'other';
}
