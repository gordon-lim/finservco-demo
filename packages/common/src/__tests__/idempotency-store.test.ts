import { IdempotencyStore } from '../idempotency-store';

describe('IdempotencyStore', () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore({ ttlMs: 1000, cleanupIntervalMs: 60000 });
  });

  afterEach(() => {
    store.destroy();
  });

  describe('acquire', () => {
    it('should return null for a new key (first writer wins)', () => {
      const result = store.acquire('user1', 'key1');
      expect(result).toBeNull();
    });

    it('should return the existing entry for a duplicate key', () => {
      store.acquire('user1', 'key1');
      const result = store.acquire('user1', 'key1');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('processing');
      expect(result!.userId).toBe('user1');
    });

    it('should scope keys per user to prevent collisions', () => {
      const result1 = store.acquire('user1', 'shared-key');
      const result2 = store.acquire('user2', 'shared-key');

      // Both should succeed as first writers for their own scope
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should return completed entry with stored response on duplicate', () => {
      store.acquire('user1', 'key1');
      store.complete('user1', 'key1', {
        statusCode: 201,
        headers: { 'content-type': 'application/json' },
        body: { id: 'tx-123' },
        responseType: 'json',
      });

      const result = store.acquire('user1', 'key1');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.response).toEqual({
        statusCode: 201,
        headers: { 'content-type': 'application/json' },
        body: { id: 'tx-123' },
        responseType: 'json',
      });
    });

    it('should allow re-acquisition after key expires', async () => {
      const shortTtlStore = new IdempotencyStore({ ttlMs: 50, cleanupIntervalMs: 60000 });

      shortTtlStore.acquire('user1', 'key1');

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = shortTtlStore.acquire('user1', 'key1');
      expect(result).toBeNull(); // Key expired, so this is treated as a new key

      shortTtlStore.destroy();
    });
  });

  describe('complete', () => {
    it('should mark an entry as completed with the stored response', () => {
      store.acquire('user1', 'key1');

      store.complete('user1', 'key1', {
        statusCode: 201,
        headers: { 'content-type': 'application/json' },
        body: { success: true },
        responseType: 'json',
      });

      const entry = store.get('user1', 'key1');
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('completed');
      expect(entry!.response!.statusCode).toBe(201);
      expect(entry!.response!.body).toEqual({ success: true });
    });

    it('should not throw when completing an unknown key', () => {
      expect(() => {
        store.complete('user1', 'nonexistent', {
          statusCode: 200,
          headers: {},
          body: null,
          responseType: 'json',
        });
      }).not.toThrow();
    });
  });

  describe('remove', () => {
    it('should remove a key so it can be reused', () => {
      store.acquire('user1', 'key1');
      store.remove('user1', 'key1');

      const result = store.acquire('user1', 'key1');
      expect(result).toBeNull(); // Can be acquired again
    });
  });

  describe('get', () => {
    it('should return undefined for a non-existent key', () => {
      expect(store.get('user1', 'nonexistent')).toBeUndefined();
    });

    it('should return undefined for an expired key', async () => {
      const shortTtlStore = new IdempotencyStore({ ttlMs: 50, cleanupIntervalMs: 60000 });

      shortTtlStore.acquire('user1', 'key1');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortTtlStore.get('user1', 'key1')).toBeUndefined();

      shortTtlStore.destroy();
    });

    it('should return a valid entry before expiry', () => {
      store.acquire('user1', 'key1');
      const entry = store.get('user1', 'key1');

      expect(entry).toBeDefined();
      expect(entry!.key).toBe('user1:key1');
      expect(entry!.status).toBe('processing');
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      const shortTtlStore = new IdempotencyStore({ ttlMs: 50, cleanupIntervalMs: 60000 });

      shortTtlStore.acquire('user1', 'key1');
      shortTtlStore.acquire('user1', 'key2');

      expect(shortTtlStore.size()).toBe(2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      shortTtlStore.cleanup();
      expect(shortTtlStore.size()).toBe(0);

      shortTtlStore.destroy();
    });

    it('should not remove non-expired entries', () => {
      store.acquire('user1', 'key1');
      store.acquire('user1', 'key2');

      store.cleanup();
      expect(store.size()).toBe(2);
    });
  });

  describe('concurrency - first writer wins', () => {
    it('should ensure only the first caller acquires the key', () => {
      // Simulate concurrent requests
      const result1 = store.acquire('user1', 'key1');
      const result2 = store.acquire('user1', 'key1');
      const result3 = store.acquire('user1', 'key1');

      // First caller wins
      expect(result1).toBeNull();
      // Subsequent callers get the existing entry
      expect(result2).not.toBeNull();
      expect(result2!.status).toBe('processing');
      expect(result3).not.toBeNull();
      expect(result3!.status).toBe('processing');
    });

    it('should handle multiple users acquiring different keys simultaneously', () => {
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(store.acquire(`user${i}`, `key${i}`));
      }

      // All should succeed as first writers
      results.forEach((result) => {
        expect(result).toBeNull();
      });

      expect(store.size()).toBe(10);
    });
  });

  describe('destroy', () => {
    it('should clear all entries and stop cleanup timer', () => {
      store.acquire('user1', 'key1');
      store.acquire('user1', 'key2');

      expect(store.size()).toBe(2);

      store.destroy();

      expect(store.size()).toBe(0);
    });
  });
});
