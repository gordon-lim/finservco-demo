import { Request, Response, NextFunction } from 'express';
import { IdempotencyStore, StoredResponse } from './idempotency-store';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IdempotencyMiddlewareOptions {
  store: IdempotencyStore;
  getUserId?: (req: Request) => string;
}

/**
 * Express middleware that enforces idempotency on mutation requests (POST, PUT, DELETE).
 *
 * Protocol:
 * - Client sends an `Idempotency-Key` header (UUID) with each mutation request.
 * - New key: process the request, store the response keyed by idempotency key.
 * - Seen key, processing complete: return the stored response (no re-processing).
 * - Seen key, still processing: return 409 Conflict.
 * - Keys expire after a configurable TTL.
 */
export function createIdempotencyMiddleware(options: IdempotencyMiddlewareOptions) {
  const { store, getUserId } = options;

  return function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Only apply to mutation methods
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
      next();
      return;
    }

    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // If no idempotency key is provided, proceed without idempotency protection
    if (!idempotencyKey) {
      next();
      return;
    }

    // Validate key format (must be UUID)
    if (!UUID_REGEX.test(idempotencyKey)) {
      res.status(400).json({
        error: 'Invalid Idempotency-Key format. Must be a valid UUID.',
        code: 'INVALID_IDEMPOTENCY_KEY',
      });
      return;
    }

    // Determine user scope (defaults to 'anonymous' if no getUserId provided)
    const userId = getUserId ? getUserId(req) : 'anonymous';

    // Try to acquire the key
    const existing = store.acquire(userId, idempotencyKey);

    if (existing) {
      if (existing.status === 'processing') {
        // Request with same key is still being processed
        res.status(409).json({
          error: 'A request with this Idempotency-Key is currently being processed.',
          code: 'IDEMPOTENCY_KEY_IN_PROGRESS',
        });
        return;
      }

      if (existing.status === 'completed' && existing.response) {
        // Return the stored response (replay)
        res.set('Idempotency-Key', idempotencyKey);
        res.set('Idempotency-Replayed', 'true');
        for (const [header, value] of Object.entries(existing.response.headers)) {
          res.set(header, value);
        }
        res.status(existing.response.statusCode).json(existing.response.body);
        return;
      }
    }

    // First writer wins - intercept the response to capture it
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let captured = false;

    res.json = ((body: unknown): Response => {
      if (!captured) {
        captured = true;
        const storedResponse: StoredResponse = {
          statusCode: res.statusCode,
          headers: {
            'content-type': 'application/json',
          },
          body,
        };

        // Only store successful responses (2xx) to allow retries on errors
        if (res.statusCode >= 200 && res.statusCode < 300) {
          store.complete(userId, idempotencyKey, storedResponse);
        } else {
          // Remove the key so client can retry on failure
          store.remove(userId, idempotencyKey);
        }
      }

      // Set idempotency headers
      res.set('Idempotency-Key', idempotencyKey);
      res.set('Idempotency-Replayed', 'false');

      return originalJson(body);
    }) as Response['json'];

    // Also handle send for non-JSON responses (e.g., 204 No Content)
    res.send = ((body?: unknown): Response => {
      if (!captured) {
        captured = true;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const storedResponse: StoredResponse = {
            statusCode: res.statusCode,
            headers: {},
            body: body ?? null,
          };
          store.complete(userId, idempotencyKey, storedResponse);
        } else {
          store.remove(userId, idempotencyKey);
        }
      }

      res.set('Idempotency-Key', idempotencyKey);
      res.set('Idempotency-Replayed', 'false');

      return originalSend(body as string);
    }) as Response['send'];

    next();
  };
}
