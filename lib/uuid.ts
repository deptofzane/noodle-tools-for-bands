const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a string is a UUID.
 *
 * Every id in this schema is a `uuid` column, and Postgres raises `22P02`
 * ("invalid input syntax for type uuid") rather than returning no rows when
 * handed anything else — so an id arriving from outside the database wants
 * checking before it reaches a query, or a bad value becomes a 500 instead of
 * a miss.
 */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
