import * as Sentry from '@sentry/nextjs';

/**
 * Next.js loads this once per server runtime. It picks the matching Sentry
 * config so the Node and edge runtimes each initialise their own SDK.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs')
    await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

/**
 * Server-side errors from React Server Components, route handlers, and server
 * actions. Without this they're logged by Next and never reported.
 */
export const onRequestError = Sentry.captureRequestError;
