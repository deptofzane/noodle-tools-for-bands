import * as Sentry from '@sentry/nextjs';
import { sharedSentryOptions } from './sentry.shared';

/**
 * Browser-side Sentry. No session replay: it would record song titles, notes,
 * and band chat — the private material this app exists to hold.
 */
Sentry.init(sharedSentryOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
