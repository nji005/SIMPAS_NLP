import * as Sentry from '@sentry/node';
import { logger } from './logger';

let isSentryInitialized = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || dsn.trim() === '') {
    return false;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 1.0,
    });
    isSentryInitialized = true;
    logger.info('Sentry error tracking initialized successfully');
    return true;
  } catch (error) {
    logger.warn({ err: error }, 'Failed to initialize Sentry, proceeding without Sentry');
    return false;
  }
}

export function captureException(error: unknown) {
  if (isSentryInitialized) {
    Sentry.captureException(error);
  }
}

export { Sentry };
