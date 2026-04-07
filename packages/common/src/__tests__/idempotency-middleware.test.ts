import express from 'express';
import request from 'supertest';
import { IdempotencyStore } from '../idempotency-store';
import { createIdempotencyMiddleware } from '../idempotency-middleware';

describe('IdempotencyMiddleware', () => {
  let store: IdempotencyStore;
  let app: express.Application;

  beforeEach(() => {
    store = new IdempotencyStore({ ttlMs: 60000, cleanupIntervalMs: 60000 });
    app = express();
    app.use(express.json());
    app.use(
      createIdempotencyMiddleware({
        store,
        getUserId: (req) => (req.headers['x-user-id'] as string) || 'anonymous',
      })
    );

    // Test POST endpoint
    app.post('/api/test', (req, res) => {
      res.status(201).json({ id: 'item-1', data: req.body });
    });

    // Test PUT endpoint
    app.put('/api/test/:id', (req, res) => {
      res.json({ id: req.params.id, updated: true, data: req.body });
    });

    // Test DELETE endpoint
    app.delete('/api/test/:id', (_req, res) => {
      res.status(204).send();
    });

    // Test GET endpoint (should not be affected by idempotency)
    app.get('/api/test', (_req, res) => {
      res.json({ items: [] });
    });

    // Test endpoint that returns an error
    app.post('/api/test/error', (_req, res) => {
      res.status(400).json({ error: 'Bad request' });
    });

    // Test endpoint with a slow response
    app.post('/api/test/slow', (_req, res) => {
      setTimeout(() => {
        res.status(201).json({ id: 'slow-item', done: true });
      }, 100);
    });
  });

  afterEach(() => {
    store.destroy();
  });

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';
  const anotherUUID = '660e8400-e29b-41d4-a716-446655440001';

  describe('basic idempotency', () => {
    it('should process request normally when no Idempotency-Key header is provided', async () => {
      const res = await request(app)
        .post('/api/test')
        .send({ name: 'test' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('item-1');
      expect(res.headers['idempotency-key']).toBeUndefined();
    });

    it('should process first request with Idempotency-Key and set response headers', async () => {
      const res = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('item-1');
      expect(res.headers['idempotency-key']).toBe(validUUID);
      expect(res.headers['idempotency-replayed']).toBe('false');
    });

    it('should replay stored response for duplicate request with same key', async () => {
      // First request
      const res1 = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test' });

      expect(res1.status).toBe(201);
      expect(res1.headers['idempotency-replayed']).toBe('false');

      // Duplicate request with same key
      const res2 = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test' });

      expect(res2.status).toBe(201);
      expect(res2.body.id).toBe('item-1');
      expect(res2.headers['idempotency-key']).toBe(validUUID);
      expect(res2.headers['idempotency-replayed']).toBe('true');
    });

    it('should process different idempotency keys independently', async () => {
      const res1 = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'first' });

      const res2 = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', anotherUUID)
        .send({ name: 'second' });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.headers['idempotency-replayed']).toBe('false');
      expect(res2.headers['idempotency-replayed']).toBe('false');
    });
  });

  describe('key validation', () => {
    it('should reject invalid Idempotency-Key format', async () => {
      const res = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', 'not-a-uuid')
        .send({ name: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
    });

    it('should accept valid UUID v4 format', async () => {
      const res = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test' });

      expect(res.status).toBe(201);
    });
  });

  describe('HTTP method filtering', () => {
    it('should not apply idempotency to GET requests', async () => {
      const res1 = await request(app)
        .get('/api/test')
        .set('Idempotency-Key', validUUID);

      const res2 = await request(app)
        .get('/api/test')
        .set('Idempotency-Key', validUUID);

      // Both should succeed without idempotency headers
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.headers['idempotency-key']).toBeUndefined();
    });

    it('should apply idempotency to PUT requests', async () => {
      const res1 = await request(app)
        .put('/api/test/123')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'updated' });

      const res2 = await request(app)
        .put('/api/test/123')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'updated' });

      expect(res1.status).toBe(200);
      expect(res1.headers['idempotency-replayed']).toBe('false');
      expect(res2.status).toBe(200);
      expect(res2.headers['idempotency-replayed']).toBe('true');
    });

    it('should apply idempotency to DELETE requests', async () => {
      const res1 = await request(app)
        .delete('/api/test/123')
        .set('Idempotency-Key', validUUID);

      expect(res1.status).toBe(204);
      expect(res1.headers['idempotency-key']).toBe(validUUID);
      expect(res1.headers['idempotency-replayed']).toBe('false');
    });

    it('should correctly replay DELETE 204 No Content without a body', async () => {
      // First DELETE request
      const res1 = await request(app)
        .delete('/api/test/123')
        .set('Idempotency-Key', validUUID);

      expect(res1.status).toBe(204);
      expect(res1.headers['idempotency-replayed']).toBe('false');

      // Replay should also be 204 with no body
      const res2 = await request(app)
        .delete('/api/test/123')
        .set('Idempotency-Key', validUUID);

      expect(res2.status).toBe(204);
      expect(res2.headers['idempotency-key']).toBe(validUUID);
      expect(res2.headers['idempotency-replayed']).toBe('true');
      expect(res2.text).toBe('');
    });
  });

  describe('user scoping', () => {
    it('should scope keys per user to prevent collisions', async () => {
      const res1 = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .set('X-User-Id', 'user-1')
        .send({ name: 'user1-data' });

      const res2 = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .set('X-User-Id', 'user-2')
        .send({ name: 'user2-data' });

      // Both should be processed (not replayed) since different users
      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.headers['idempotency-replayed']).toBe('false');
      expect(res2.headers['idempotency-replayed']).toBe('false');
    });
  });

  describe('error handling', () => {
    it('should allow retry after a failed request (key removed on error)', async () => {
      // First request fails
      const res1 = await request(app)
        .post('/api/test/error')
        .set('Idempotency-Key', validUUID)
        .send({});

      expect(res1.status).toBe(400);

      // Key should be removed, allowing retry
      const entry = store.get('anonymous', validUUID);
      expect(entry).toBeUndefined();
    });
  });

  describe('concurrent requests', () => {
    it('should return 409 Conflict when same key is still processing', async () => {
      // Manually acquire the key to simulate in-progress state
      store.acquire('anonymous', validUUID);

      const res = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_IN_PROGRESS');
    });

    it('should handle multiple concurrent requests with different keys', async () => {
      const uuids = [
        '110e8400-e29b-41d4-a716-446655440001',
        '220e8400-e29b-41d4-a716-446655440002',
        '330e8400-e29b-41d4-a716-446655440003',
        '440e8400-e29b-41d4-a716-446655440004',
        '550e8400-e29b-41d4-a716-446655440005',
      ];

      const promises = uuids.map((uuid) =>
        request(app)
          .post('/api/test')
          .set('Idempotency-Key', uuid)
          .send({ key: uuid })
      );

      const results = await Promise.all(promises);

      results.forEach((res) => {
        expect(res.status).toBe(201);
        expect(res.headers['idempotency-replayed']).toBe('false');
      });
    });

    it('should correctly replay after concurrent first-and-duplicate', async () => {
      // First request completes
      const res1 = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'original' });

      expect(res1.status).toBe(201);

      // Multiple duplicate requests
      const duplicates = await Promise.all([
        request(app)
          .post('/api/test')
          .set('Idempotency-Key', validUUID)
          .send({ name: 'duplicate1' }),
        request(app)
          .post('/api/test')
          .set('Idempotency-Key', validUUID)
          .send({ name: 'duplicate2' }),
      ]);

      duplicates.forEach((res) => {
        expect(res.status).toBe(201);
        expect(res.headers['idempotency-replayed']).toBe('true');
        expect(res.body.id).toBe('item-1');
      });
    });
  });

  describe('response fidelity', () => {
    it('should preserve status code in replayed response', async () => {
      await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test' });

      const res = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test' });

      expect(res.status).toBe(201);
    });

    it('should preserve body in replayed response', async () => {
      const original = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test-data' });

      const replay = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'different-data' });

      expect(replay.body).toEqual(original.body);
    });

    it('should include idempotency headers in replayed response', async () => {
      await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test' });

      const res = await request(app)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({ name: 'test' });

      expect(res.headers['idempotency-key']).toBe(validUUID);
      expect(res.headers['idempotency-replayed']).toBe('true');
    });
  });

  describe('TTL expiry', () => {
    it('should allow new request after key expires', async () => {
      const shortTtlStore = new IdempotencyStore({ ttlMs: 50, cleanupIntervalMs: 60000 });
      const shortTtlApp = express();
      shortTtlApp.use(express.json());
      shortTtlApp.use(createIdempotencyMiddleware({ store: shortTtlStore }));
      shortTtlApp.post('/api/test', (_req, res) => {
        res.status(201).json({ fresh: true });
      });

      // First request
      const res1 = await request(shortTtlApp)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({});

      expect(res1.status).toBe(201);
      expect(res1.headers['idempotency-replayed']).toBe('false');

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should be treated as a new request
      const res2 = await request(shortTtlApp)
        .post('/api/test')
        .set('Idempotency-Key', validUUID)
        .send({});

      expect(res2.status).toBe(201);
      expect(res2.headers['idempotency-replayed']).toBe('false');

      shortTtlStore.destroy();
    });
  });
});
