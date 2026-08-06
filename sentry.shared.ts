import type { ErrorEvent } from '@sentry/nextjs';

/**
 * Sentry settings shared by the browser, server, and edge runtimes.
 *
 * Deliberately quiet about content. Bands keep private recordings, notes, and
 * chat in here, so nothing that could carry them — request bodies, headers,
 * cookies, user email — is sent. What's left is the shape of a failure: where
 * it happened, on what runtime, and the stack. That's what a crash report is
 * for; the rest belongs only in the database.
 */
export const sharedSentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  /**
   * Absent DSN disables the SDK entirely, which is the state in development
   * and in any deploy that hasn't been given one. Init still runs so nothing
   * has to be conditional at the call sites.
   */
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  /** Never attach IP, cookies, or user identifiers. */
  sendDefaultPii: false,
  /**
   * Errors only. Performance tracing on an app that streams audio would
   * sample a lot of long-running requests to say very little.
   */
  tracesSampleRate: 0,
  /**
   * Last line of defence: strip anything that could carry band content even
   * if a future SDK default starts collecting it.
   */
  beforeSend(event: ErrorEvent): ErrorEvent {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      delete event.request.headers;
    }
    delete event.user;
    return event;
  },
};
