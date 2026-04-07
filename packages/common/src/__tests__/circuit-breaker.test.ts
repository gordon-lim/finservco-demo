import { CircuitBreaker, CircuitBreakerOpenError, riskEngineFallback } from '../circuit-breaker';

// Suppress logger output during tests
jest.mock('../../../../packages/logger/src', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}));

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      monitorWindowMs: 5000,
    });
  });

  describe('CLOSED state (normal operation)', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should pass through successful requests', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should track failures without opening below threshold', async () => {
      const failingAction = async () => {
        throw new Error('service down');
      };

      // 2 failures (below threshold of 3)
      await expect(breaker.execute(failingAction)).rejects.toThrow('service down');
      await expect(breaker.execute(failingAction)).rejects.toThrow('service down');

      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should transition to OPEN after reaching failure threshold', async () => {
      const failingAction = async () => {
        throw new Error('service down');
      };

      // First 2 failures stay in CLOSED
      await expect(breaker.execute(failingAction)).rejects.toThrow('service down');
      await expect(breaker.execute(failingAction)).rejects.toThrow('service down');
      expect(breaker.getState()).toBe('CLOSED');

      // 3rd failure trips the breaker to OPEN but propagates the original error
      await expect(breaker.execute(failingAction)).rejects.toThrow('service down');
      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('OPEN state (failing)', () => {
    beforeEach(async () => {
      const failingAction = async () => {
        throw new Error('service down');
      };
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingAction);
        } catch {
          // expected
        }
      }
      expect(breaker.getState()).toBe('OPEN');
    });

    it('should reject requests immediately when open (no fallback)', async () => {
      await expect(
        breaker.execute(async () => 'should not run')
      ).rejects.toThrow(CircuitBreakerOpenError);
    });

    it('should use fallback when circuit is open', async () => {
      const result = await breaker.execute(
        async () => 'should not run',
        () => 'fallback-value',
      );
      expect(result).toBe('fallback-value');
    });

    it('should use config fallbackResponse when no explicit fallback provided', async () => {
      const breakerWithFallback = new CircuitBreaker('test-with-fallback', {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        monitorWindowMs: 5000,
        fallbackResponse: { default: true },
      });

      try {
        await breakerWithFallback.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      const result = await breakerWithFallback.execute(async () => 'should not run');
      expect(result).toEqual({ default: true });
    });
  });

  describe('HALF-OPEN state (testing)', () => {
    it('should transition to HALF-OPEN after reset timeout', async () => {
      const shortBreaker = new CircuitBreaker('short-timeout', {
        failureThreshold: 1,
        resetTimeoutMs: 50,
        monitorWindowMs: 5000,
      });

      // Trip the breaker
      try {
        await shortBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }
      expect(shortBreaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Next request should transition to HALF-OPEN and succeed
      const result = await shortBreaker.execute(async () => 'recovered');
      expect(result).toBe('recovered');
      expect(shortBreaker.getState()).toBe('CLOSED');
    });

    it('should return to OPEN if test request fails in HALF-OPEN', async () => {
      const shortBreaker = new CircuitBreaker('short-timeout-fail', {
        failureThreshold: 1,
        resetTimeoutMs: 50,
        monitorWindowMs: 5000,
      });

      // Trip the breaker
      try {
        await shortBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }
      expect(shortBreaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Test request fails -> back to OPEN, propagates original error
      await expect(
        shortBreaker.execute(
          async () => {
            throw new Error('still failing');
          },
          () => 'fallback-after-half-open-fail',
        ),
      ).rejects.toThrow('still failing');

      expect(shortBreaker.getState()).toBe('OPEN');
    });

    it('should close circuit when test request succeeds in HALF-OPEN', async () => {
      const shortBreaker = new CircuitBreaker('short-timeout-success', {
        failureThreshold: 1,
        resetTimeoutMs: 50,
        monitorWindowMs: 5000,
      });

      // Trip the breaker
      try {
        await shortBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Test request succeeds -> CLOSED
      await shortBreaker.execute(async () => 'success');
      expect(shortBreaker.getState()).toBe('CLOSED');

      // Should be able to make normal requests again
      const result = await shortBreaker.execute(async () => 'normal');
      expect(result).toBe('normal');
    });
  });

  describe('Rolling window', () => {
    it('should only count failures within the monitor window', async () => {
      const windowBreaker = new CircuitBreaker('window-test', {
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        monitorWindowMs: 100,
      });

      // Cause 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await windowBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      // Wait for failures to expire from monitor window
      await new Promise(resolve => setTimeout(resolve, 150));

      // This failure should not trip the breaker because old ones expired
      try {
        await windowBreaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(windowBreaker.getState()).toBe('CLOSED');
    });
  });

  describe('Metrics', () => {
    it('should track metrics correctly', async () => {
      // Successful request
      await breaker.execute(async () => 'ok');

      const metrics = breaker.getMetrics();
      expect(metrics.state).toBe('CLOSED');
      expect(metrics.successCount).toBe(1);
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.totalFailures).toBe(0);
      expect(metrics.totalFallbacks).toBe(0);
    });

    it('should track fallback usage', async () => {
      // Trip the breaker: 3rd failure also triggers a fallback (circuit opens mid-request)
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      // Use explicit fallback on subsequent call (circuit already OPEN)
      await breaker.execute(
        async () => 'should not run',
        () => 'fallback',
      );

      const metrics = breaker.getMetrics();
      expect(metrics.state).toBe('OPEN');
      expect(metrics.totalFailures).toBe(3);
      // 1 fallback: only the explicit one (threshold-triggering failure propagates original error)
      expect(metrics.totalFallbacks).toBe(1);
      expect(metrics.totalRequests).toBe(4);
    });
  });
});

describe('riskEngineFallback', () => {
  it('should auto-approve low-value transactions (<$1000)', () => {
    const result = riskEngineFallback(500);
    expect(result.riskLevel).toBe('low');
    expect(result.score).toBe(0);
    expect(result.reviewRequired).toBe(false);
    expect(result.fallback).toBe(true);
    expect(result.flags).toContain('circuit-breaker-fallback');
    expect(result.flags).toContain('pending-async-review');
  });

  it('should queue high-value transactions (>=$1000) for review', () => {
    const result = riskEngineFallback(1000);
    expect(result.riskLevel).toBe('high');
    expect(result.score).toBe(-1);
    expect(result.reviewRequired).toBe(true);
    expect(result.fallback).toBe(true);
    expect(result.flags).toContain('circuit-breaker-fallback');
    expect(result.flags).toContain('queued-for-review');
  });

  it('should auto-approve $999.99 transaction', () => {
    const result = riskEngineFallback(999.99);
    expect(result.riskLevel).toBe('low');
    expect(result.reviewRequired).toBe(false);
  });

  it('should queue $5000 transaction for review', () => {
    const result = riskEngineFallback(5000);
    expect(result.riskLevel).toBe('high');
    expect(result.reviewRequired).toBe(true);
  });
});
