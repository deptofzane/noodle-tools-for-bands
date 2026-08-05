/**
 * The uploader's local calendar day, as sent by the client.
 *
 * Upload notifications roll up per band per *local* day, so the day has to
 * travel with the request — the server's own date rolls over at a different
 * moment for everyone. Falls back to the server's date when a caller doesn't
 * send one, which keeps the rollup working (just grouped by the server's
 * midnight) rather than dropping the notification.
 */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function readUploadDay(value: unknown): string {
  if (typeof value === 'string' && DAY_RE.test(value)) return value;
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
