import { createLogger } from '../../../../packages/logger/src';
import { CircuitBreaker } from '../../../../packages/common/src/circuit-breaker';
import type { CircuitBreakerMetrics } from '../../../../packages/common/src/circuit-breaker';

const logger = createLogger('service-client');

// Service URLs - would be configured via environment in production
const SERVICE_URLS = {
  accounts: process.env.ACCOUNT_SERVICE_URL || 'http://localhost:3001',
  transactions: process.env.TRANSACTION_SERVICE_URL || 'http://localhost:3002',
  risk: process.env.RISK_ENGINE_URL || 'http://localhost:3003',
  notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
};

type ServiceName = keyof typeof SERVICE_URLS;

// Circuit breakers per service
const circuitBreakers: Record<ServiceName, CircuitBreaker> = {
  accounts: new CircuitBreaker('accounts', {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    monitorWindowMs: 60000,
    logger,
  }),
  transactions: new CircuitBreaker('transactions', {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    monitorWindowMs: 60000,
    logger,
  }),
  risk: new CircuitBreaker('risk-engine', {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    monitorWindowMs: 60000,
    logger,
  }),
  notifications: new CircuitBreaker('notifications', {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    monitorWindowMs: 60000,
    logger,
  }),
};

export async function callService(
  service: ServiceName,
  path: string,
  options: RequestInit = {},
  fallback?: () => Response | Promise<Response>,
): Promise<Response> {
  const url = `${SERVICE_URLS[service]}${path}`;
  const breaker = circuitBreakers[service];

  logger.info('Calling service', { service, path, url, circuitState: breaker.getState() });

  return breaker.execute(
    async () => {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      return response;
    },
    fallback,
  );
}

/**
 * Returns the circuit breaker health status for all services.
 * Used by the dashboard health endpoint.
 */
export function getCircuitBreakerHealth(): Record<ServiceName, CircuitBreakerMetrics> {
  const health: Partial<Record<ServiceName, CircuitBreakerMetrics>> = {};
  for (const [service, breaker] of Object.entries(circuitBreakers)) {
    health[service as ServiceName] = breaker.getMetrics();
  }
  return health as Record<ServiceName, CircuitBreakerMetrics>;
}
