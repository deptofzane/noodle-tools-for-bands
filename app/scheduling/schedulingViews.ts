/**
 * The Scheduling page's three views. Kept out of the client component so the
 * server page can validate `?view=` too — every export of a 'use client'
 * module becomes a client reference and can't be called during the server
 * render (the same reason `bandTabs.ts` exists).
 */
export const SCHEDULING_VIEWS = ['calendar', 'events', 'venues'] as const;

export type SchedulingView = (typeof SCHEDULING_VIEWS)[number];

/** The view a bare `/scheduling` opens on. It stays paramless in the URL. */
export const DEFAULT_SCHEDULING_VIEW: SchedulingView = 'calendar';

export function isSchedulingView(
  v: string | null | undefined,
): v is SchedulingView {
  return SCHEDULING_VIEWS.includes(v as SchedulingView);
}
