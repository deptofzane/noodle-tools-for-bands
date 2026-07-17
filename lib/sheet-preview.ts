/** How to render a sheet-music file inline. */
export type PreviewKind = 'image' | 'pdf' | 'text' | 'other';

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
  if (m.startsWith('text/') || ['txt', 'md', 'markdown', 'csv'].includes(ext))
    return 'text';
  return 'other';
}
