import express, { Request, Response } from 'express';
import http from 'http';
import { RateLimiter, createGlobalRateLimiter, createGetRateLimiter, createPostTransactionRateLimiter, createNotificationRateLimiter } from '../rate-limiter';

function createTestApp(limiter: RateLimiter): express.Express {
  const app = express();
  app.use(limiter.middleware());
  app.get('/test', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  app.post('/test', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  return app;
}

function makeRequest(server: http.Server, method: string, path: string): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('Server not listening'));
      return;
    }
    const options = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: data ? JSON.parse(data) : {},
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('RateLimiter', () => {
  let server: http.Server;

  afterEach((done) => {
    if (server && server.listening) {
      server.close(done);
    } else {
      done();
    }
  });

  it('should allow requests within the limit', (done) => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 5,
      keyGenerator: () => 'test-key',
    });
    const app = createTestApp(limiter);
    server = app.listen(0, async () => {
      const res = await makeRequest(server, 'GET', '/test');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      done();
    });
  });

  it('should include X-RateLimit-* headers in successful responses', (done) => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 10,
      keyGenerator: () => 'header-test',
    });
    const app = createTestApp(limiter);
    server = app.listen(0, async () => {
      const res = await makeRequest(server, 'GET', '/test');
      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('10');
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
      done();
    });
  });

  it('should decrement remaining count with each request', (done) => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 5,
      keyGenerator: () => 'decrement-test',
    });
    const app = createTestApp(limiter);
    server = app.listen(0, async () => {
      const res1 = await makeRequest(server, 'GET', '/test');
      expect(res1.headers['x-ratelimit-remaining']).toBe('4');

      const res2 = await makeRequest(server, 'GET', '/test');
      expect(res2.headers['x-ratelimit-remaining']).toBe('3');

      const res3 = await makeRequest(server, 'GET', '/test');
      expect(res3.headers['x-ratelimit-remaining']).toBe('2');
      done();
    });
  });

  it('should return 429 when rate limit is exceeded', (done) => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 3,
      keyGenerator: () => 'exceed-test',
    });
    const app = createTestApp(limiter);
    server = app.listen(0, async () => {
      // Use up all tokens
      await makeRequest(server, 'GET', '/test');
      await makeRequest(server, 'GET', '/test');
      await makeRequest(server, 'GET', '/test');

      // This should be rate limited
      const res = await makeRequest(server, 'GET', '/test');
      expect(res.status).toBe(429);
      expect(res.body.error).toBeDefined();
      expect(res.body.retryAfter).toBeDefined();
      done();
    });
  });

  it('should include Retry-After header when rate limited', (done) => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      keyGenerator: () => 'retry-after-test',
    });
    const app = createTestApp(limiter);
    server = app.listen(0, async () => {
      await makeRequest(server, 'GET', '/test');

      const res = await makeRequest(server, 'GET', '/test');
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      expect(parseInt(res.headers['retry-after'] as string)).toBeGreaterThan(0);
      expect(res.headers['x-ratelimit-remaining']).toBe('0');
      done();
    });
  });

  it('should use custom error message', (done) => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      keyGenerator: () => 'custom-msg-test',
      message: 'Custom rate limit message',
    });
    const app = createTestApp(limiter);
    server = app.listen(0, async () => {
      await makeRequest(server, 'GET', '/test');

      const res = await makeRequest(server, 'GET', '/test');
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Custom rate limit message');
      done();
    });
  });

  it('should track different keys independently', (done) => {
    let callCount = 0;
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      keyGenerator: () => `key-${callCount++ % 2}`,
    });
    const app = createTestApp(limiter);
    server = app.listen(0, async () => {
      // key-0: request 1
      const res1 = await makeRequest(server, 'GET', '/test');
      expect(res1.status).toBe(200);

      // key-1: request 1
      const res2 = await makeRequest(server, 'GET', '/test');
      expect(res2.status).toBe(200);

      // key-0: request 2
      const res3 = await makeRequest(server, 'GET', '/test');
      expect(res3.status).toBe(200);

      // key-1: request 2
      const res4 = await makeRequest(server, 'GET', '/test');
      expect(res4.status).toBe(200);

      // key-0: request 3 - should be rate limited
      const res5 = await makeRequest(server, 'GET', '/test');
      expect(res5.status).toBe(429);

      done();
    });
  });

  it('should reset buckets when reset() is called', (done) => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      keyGenerator: () => 'reset-test',
    });
    const app = createTestApp(limiter);
    server = app.listen(0, async () => {
      await makeRequest(server, 'GET', '/test');
      const res1 = await makeRequest(server, 'GET', '/test');
      expect(res1.status).toBe(429);

      limiter.reset();

      const res2 = await makeRequest(server, 'GET', '/test');
      expect(res2.status).toBe(200);
      done();
    });
  });
});

describe('Factory functions', () => {
  it('createGlobalRateLimiter should create a limiter with 1000 max requests', () => {
    const limiter = createGlobalRateLimiter();
    expect(limiter).toBeInstanceOf(RateLimiter);
  });

  it('createGetRateLimiter should create a limiter with 100 max requests', () => {
    const limiter = createGetRateLimiter();
    expect(limiter).toBeInstanceOf(RateLimiter);
  });

  it('createPostTransactionRateLimiter should create a limiter with 20 max requests', () => {
    const limiter = createPostTransactionRateLimiter();
    expect(limiter).toBeInstanceOf(RateLimiter);
  });

  it('createNotificationRateLimiter should create a limiter with 10 max requests', () => {
    const limiter = createNotificationRateLimiter();
    expect(limiter).toBeInstanceOf(RateLimiter);
  });
});
