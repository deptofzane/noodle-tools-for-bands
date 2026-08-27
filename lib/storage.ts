/**
 * What one band may store.
 *
 * Nothing enforces this yet — uploads still succeed past it. It lives here so
 * the File management page's meter and the upload warnings read the same
 * number, and so turning it into a real cap later is one change.
 */
export const BAND_STORAGE_LIMIT_BYTES = 10 * 1024 ** 3;

export type UsageLevel = 'ok' | 'warn' | 'critical';

/** 80% of the cap earns a nudge, 90% a firmer one. */
export function usageLevel(bytes: number): UsageLevel {
  const used = bytes / BAND_STORAGE_LIMIT_BYTES;
  if (used >= 0.9) return 'critical';
  if (used >= 0.8) return 'warn';
  return 'ok';
}
