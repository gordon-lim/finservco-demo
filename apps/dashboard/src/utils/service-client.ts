import { createLogger } from '../../../../packages/logger/src';

const logger = createLogger('service-client');

// Service URLs - would be configured via environment in production
const SERVICE_URLS = {
  accounts: process.env.ACCOUNT_SERVICE_URL || 'http://localhost:3001',
  transactions: process.env.TRANSACTION_SERVICE_URL || 'http://localhost:3002',
  risk: process.env.RISK_ENGINE_URL || 'http://localhost:3003',
  notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
};

// MISSING FEATURE (Issue #16): No circuit breaker for service calls
// If a downstream service is down, calls will just timeout
export async function callService(
  service: keyof typeof SERVICE_URLS,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${SERVICE_URLS[service]}${path}`;

  logger.info('Calling service', { service, path, url });

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    return response;
  } catch (error) {
    // MISSING FEATURE (Issue #16): No circuit breaker
    // Just logs and re-throws - no fallback, no backoff, no circuit breaking
    logger.error('Service call failed', {
      service,
      path,
      error: (error as Error).message,
    });
    throw error;
  }
}
