import * as Sentry from '@sentry/nextjs';
import { sharedSentryOptions } from './sentry.shared';

Sentry.init(sharedSentryOptions);
