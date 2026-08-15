/**
 * What each Google Picker button will show, and what it will accept back.
 *
 * Two layers, because neither is sufficient alone:
 *
 *   1. `mimeTypes` narrows the Drive view, so the everyday case is a list of
 *      only the files that make sense to pick.
 *   2. `accepts` re-checks whatever comes back. The Picker also offers an
 *      unfiltered "all files" view as an escape hatch (Drive's MIME labels are
 *      unreliable — see `resolveContentType` in serve-mime.ts, and ChordPro
 *      charts have no registered type at all), so a filtered view can't be
 *      trusted as a guarantee. This is the layer that turns "picked a jpg for
 *      Add audio" into an error instead of a broken import.
 *
 * Both predicates fall back to the file extension, which is the whole reason
 * they're reused here rather than re-deriving a MIME check: Drive labels the
 * same .mp3 several different ways, and an extension is often the only honest
 * signal about a Drive file's contents.
 */
import { normalizeAudioMime } from './audio-mime';
import { previewKind } from './sheet-preview';

export interface PickerFilter {
  /** MIME types the filtered Drive view lists. Not a guarantee — see above. */
  mimeTypes: string[];
  /**
   * Name for the narrowed tab, and the basis of the dialog's title.
   *
   * Without it the picker labels every DocsView "Google Drive", so the
   * narrowed view and the unfiltered one beside it are two identical tabs with
   * no way to tell which is which.
   */
  viewLabel: string;
  /** Whether a picked file is something this button can actually import. */
  accepts: (file: { name: string; mimeType?: string }) => boolean;
  /** Used in the rejection message: "cover.jpg isn't an audio file." */
  singular: string;
  /** Used in the rejection message: "…that aren't audio files". */
  plural: string;
}

/**
 * Audio. Deliberately wide: every spelling of an audio type Drive has been
 * seen to hand back, since a type missing from this list means a file the user
 * owns silently isn't in the picker.
 */
export const AUDIO_PICKER_FILTER: PickerFilter = {
  viewLabel: 'Audio',
  mimeTypes: [
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/vnd.wave',
    'audio/ogg',
    'audio/x-ogg',
    'audio/opus',
    'audio/flac',
    'audio/x-flac',
    'audio/webm',
  ],
  accepts: (file) => normalizeAudioMime(file.mimeType ?? '', file.name) !== null,
  singular: 'an audio file',
  plural: 'audio files',
};

/**
 * Sheet music: what the panel can actually render (see `previewKind`).
 *
 * ChordPro charts (.cho/.chopro/.chordpro/.pro/.crd) are intentionally absent
 * from `mimeTypes` — they have no registered MIME type, so Drive reports them
 * as octet-stream, and listing that here would readmit every binary file in
 * Drive. They stay reachable through the picker's unfiltered view, and
 * `accepts` recognises them by extension, so importing one still works.
 */
export const SHEET_PICKER_FILTER: PickerFilter = {
  viewLabel: 'Sheet music',
  mimeTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/markdown',
    'text/csv',
  ],
  // `previewKind` returns 'other' for anything unrenderable, which also turns
  // away native Google Docs (no bytes to download) and SVG (scriptable).
  accepts: (file) => previewKind(file.mimeType ?? '', file.name) !== 'other',
  singular: 'a sheet-music file',
  plural: 'sheet-music files',
};

/** Message shown when the picker hands back files this button can't take. */
export function rejectionMessage(
  rejected: Array<{ name: string }>,
  filter: PickerFilter,
): string {
  const names = rejected.map((f) => f.name);
  if (names.length === 1) return `${names[0]} isn’t ${filter.singular}.`;
  const shown = names.slice(0, 3).join(', ');
  const rest = names.length - 3;
  return `Skipped ${names.length} files that aren’t ${filter.plural}: ${shown}${
    rest > 0 ? `, and ${rest} more` : ''
  }.`;
}
