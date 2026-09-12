/**
 * Whether an event belongs on a calendar narrowed to one band.
 *
 * The rule is "this band's events, plus anything I was personally invited to".
 * Visibility is the union of your bands' events and events you were added to
 * individually (`listEventsForUserInRange`), and that second kind can sit in a
 * band you don't belong to — a strict `bandId` match would drop it from every
 * band's view, so an event you accepted would exist nowhere on your calendar.
 *
 * A personal invite needs no flag from the server to spot: if the event's band
 * isn't one of yours, being invited is the only reason you can see it at all.
 *
 * `History`'s band narrowing deliberately does the opposite and excludes them
 * (see `listPastEventsForUser`), because "this band's history" is a claim about
 * the band. A calendar is a claim about *you*, which is why this differs.
 *
 * An empty `selectedBandId` means nothing to narrow to — every visible event
 * shows, which is also what a user with no bands sees.
 */
export function visibleInBand<T extends { bandId: string }>(
  event: T,
  selectedBandId: string,
  myBandIds: ReadonlySet<string>,
): boolean {
  if (!selectedBandId) return true;
  return event.bandId === selectedBandId || !myBandIds.has(event.bandId);
}
