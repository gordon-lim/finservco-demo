import { Request, Response, NextFunction } from 'express';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: Request) => string;
  message?: string;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  private getOrCreateBucket(key: string): TokenBucket {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.config.maxRequests, lastRefill: now };
      this.buckets.set(key, bucket);
      return bucket;
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    const tokensToAdd = elapsed * refillRate;
    bucket.tokens = Math.min(this.config.maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    return bucket;
  }

  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = this.config.keyGenerator(req);
      const bucket = this.getOrCreateBucket(key);

      if (bucket.tokens < 1) {
        const retryAfterMs = (1 - bucket.tokens) / (this.config.maxRequests / this.config.windowMs);
        const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

        res.set('Retry-After', String(retryAfterSeconds));
        res.set('X-RateLimit-Limit', String(this.config.maxRequests));
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + retryAfterMs) / 1000)));

        res.status(429).json({
          error: this.config.message || 'Too Many Requests',
          retryAfter: retryAfterSeconds,
        });
        return;
      }

      bucket.tokens -= 1;

      const remaining = Math.floor(bucket.tokens);
      res.set('X-RateLimit-Limit', String(this.config.maxRequests));
      res.set('X-RateLimit-Remaining', String(remaining));
      res.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + this.config.windowMs) / 1000)));

      next();
    };
  }

  // Expose for testing: reset all buckets
  reset(): void {
    this.buckets.clear();
  }
}

// Pre-configured rate limiters for common use cases

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Per-IP rate limiter for GET endpoints: 100 req / 1 min */
export function createGetRateLimiter(): RateLimiter {
  return new RateLimiter({
    windowMs: 60_000,
    maxRequests: 100,
    keyGenerator: (req) => `get:${getClientIp(req)}`,
    message: 'Too many read requests, please try again later',
  });
}

/** Per-IP rate limiter for POST transaction endpoints: 20 req / 1 min */
export function createPostTransactionRateLimiter(): RateLimiter {
  return new RateLimiter({
    windowMs: 60_000,
    maxRequests: 20,
    keyGenerator: (req) => `post-tx:${getClientIp(req)}`,
    message: 'Too many transaction requests, please try again later',
  });
}

/** Per-IP rate limiter for POST notification endpoints: 10 req / 1 min */
export function createNotificationRateLimiter(): RateLimiter {
  return new RateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
    keyGenerator: (req) => `notify:${getClientIp(req)}`,
    message: 'Too many notification requests, please try again later',
  });
}

/** Global rate limiter for all endpoints: 1000 req / 1 min */
export function createGlobalRateLimiter(): RateLimiter {
  return new RateLimiter({
    windowMs: 60_000,
    maxRequests: 1000,
    keyGenerator: () => 'global',
    message: 'Server is experiencing high load, please try again later',
  });
}
