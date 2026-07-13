/**
 * Audio MIME helpers shared by the song-registration and audio-version
 * upload routes. Node-agnostic (pure string logic).
 */

/** Cap imported/uploaded audio to keep object storage + a memory buffer sane. */
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB

/** Audio types we accept for local upload (extension fallback below). */
const AUDIO_EXT_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  flac: 'audio/flac',
  aac: 'audio/aac',
};

/** Resolve a local upload to an audio MIME type, or null to reject it. */
export function normalizeAudioMime(
  rawMime: string,
  fileName: string,
): string | null {
  const mime = (rawMime || '').toLowerCase().split(';')[0]!.trim();
  if (mime.startsWith('audio/')) return mime;
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext && AUDIO_EXT_TO_MIME[ext]) return AUDIO_EXT_TO_MIME[ext];
  return null;
}
