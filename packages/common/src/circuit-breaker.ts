import type { RiskLevel } from './types';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

export interface CircuitBreakerLogger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitorWindowMs: number;
  fallbackResponse?: unknown;
  logger?: CircuitBreakerLogger;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalRequests: number;
  totalFailures: number;
  totalFallbacks: number;
}

interface FailureRecord {
  timestamp: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  monitorWindowMs: 60000,
};

const noopLogger: CircuitBreakerLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures: FailureRecord[] = [];
  private successCount = 0;
  private lastStateChange: number = Date.now();
  private totalRequests = 0;
  private totalFailures = 0;
  private totalFallbacks = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;
  private readonly logger: CircuitBreakerLogger;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = config.logger || noopLogger;
    this.logger.info('Circuit breaker initialized', {
      name: this.name,
      config: this.config,
    });
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.getRecentFailureCount(),
      successCount: this.successCount,
      lastFailureTime: this.failures.length > 0
        ? this.failures[this.failures.length - 1].timestamp
        : null,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalFallbacks: this.totalFallbacks,
    };
  }

  async execute<T>(
    action: () => Promise<T>,
    fallback?: () => T | Promise<T>,
  ): Promise<T> {
    this.totalRequests++;

    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('HALF-OPEN');
      } else {
        return this.handleFallback<T>(fallback);
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF-OPEN') {
      this.logger.info('Half-open test succeeded, closing circuit', {
        name: this.name,
      });
      this.transitionTo('CLOSED');
    }
    this.successCount++;
  }

  private onFailure(error: unknown): void {
    const now = Date.now();
    this.failures.push({ timestamp: now });
    this.totalFailures++;

    this.pruneOldFailures(now);

    const recentFailures = this.getRecentFailureCount();

    this.logger.warn('Request failed', {
      name: this.name,
      recentFailures,
      threshold: this.config.failureThreshold,
      state: this.state,
      error: error instanceof Error ? error.message : String(error),
    });

    if (this.state === 'HALF-OPEN') {
      this.logger.warn('Half-open test failed, re-opening circuit', {
        name: this.name,
      });
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && recentFailures >= this.config.failureThreshold) {
      this.logger.error('Failure threshold reached, opening circuit', {
        name: this.name,
        recentFailures,
        threshold: this.config.failureThreshold,
      });
      this.transitionTo('OPEN');
    }
  }

  private handleFallback<T>(fallback?: () => T | Promise<T>): T | Promise<T> {
    if (fallback) {
      this.totalFallbacks++;
      this.logger.warn('Circuit open, using fallback', {
        name: this.name,
        totalFallbacks: this.totalFallbacks,
      });
      return fallback();
    }

    if (this.config.fallbackResponse !== undefined) {
      this.totalFallbacks++;
      this.logger.warn('Circuit open, using fallback', {
        name: this.name,
        totalFallbacks: this.totalFallbacks,
      });
      return this.config.fallbackResponse as T;
    }

    throw new CircuitBreakerOpenError(this.name);
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const previousState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === 'CLOSED') {
      this.failures = [];
      this.successCount = 0;
    }

    this.logger.info('Circuit breaker state transition', {
      name: this.name,
      from: previousState,
      to: newState,
    });
  }

  private shouldAttemptReset(): boolean {
    const elapsed = Date.now() - this.lastStateChange;
    return elapsed >= this.config.resetTimeoutMs;
  }

  private pruneOldFailures(now: number): void {
    const cutoff = now - this.config.monitorWindowMs;
    this.failures = this.failures.filter(f => f.timestamp > cutoff);
  }

  private getRecentFailureCount(): number {
    const now = Date.now();
    const cutoff = now - this.config.monitorWindowMs;
    return this.failures.filter(f => f.timestamp > cutoff).length;
  }
}

export class CircuitBreakerOpenError extends Error {
  public readonly circuitName: string;

  constructor(circuitName: string) {
    super(`Circuit breaker '${circuitName}' is OPEN - request rejected`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = circuitName;
  }
}

export interface RiskEngineFallbackResult {
  riskLevel: RiskLevel;
  score: number;
  flags: string[];
  reviewRequired: boolean;
  fallback: boolean;
}

/**
 * Risk engine fallback strategy based on transaction value.
 * - Low-value transactions (<$1000): Auto-approve with riskLevel "low", flagged for async review.
 * - High-value transactions (>=$1000): Return riskLevel "high" with reviewRequired, queued for review when service recovers.
 */
export function riskEngineFallback(
  transactionAmount: number,
  logger: CircuitBreakerLogger = noopLogger,
): RiskEngineFallbackResult {
  if (transactionAmount < 1000) {
    logger.warn('Risk engine fallback: auto-approving low-value transaction', {
      amount: transactionAmount,
      action: 'auto-approve',
    });
    return {
      riskLevel: 'low',
      score: 0,
      flags: ['circuit-breaker-fallback', 'pending-async-review'],
      reviewRequired: false,
      fallback: true,
    };
  }

  logger.warn('Risk engine fallback: queuing high-value transaction for review', {
    amount: transactionAmount,
    action: 'pending-review',
  });
  return {
    riskLevel: 'high',
    score: -1,
    flags: ['circuit-breaker-fallback', 'queued-for-review'],
    reviewRequired: true,
    fallback: true,
  };
}
