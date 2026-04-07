
export type StoredResponseType = 'json' | 'send';

export interface StoredResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  responseType: StoredResponseType;
}

export type IdempotencyEntryStatus = 'processing' | 'completed';

export interface IdempotencyEntry {
  key: string;
  userId: string;
  status: IdempotencyEntryStatus;
  response: StoredResponse | null;
  createdAt: number;
  expiresAt: number;
}

export interface IdempotencyStoreOptions {
  ttlMs: number;
  cleanupIntervalMs: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class IdempotencyStore {
  private entries: Map<string, IdempotencyEntry> = new Map();
  private ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: Partial<IdempotencyStoreOptions>) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    const cleanupIntervalMs = options?.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);

    // Allow the timer to not keep the process alive
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Build a scoped key combining userId and idempotency key to prevent collisions.
   */
  private scopedKey(userId: string, key: string): string {
    return `${userId}:${key}`;
  }

  /**
   * Attempt to acquire an idempotency key. Returns the entry if the key was
   * already claimed (either processing or completed). Returns null if this
   * caller successfully claimed the key (first writer wins).
   */
  acquire(userId: string, key: string): IdempotencyEntry | null {
    const scoped = this.scopedKey(userId, key);
    const existing = this.entries.get(scoped);

    if (existing) {
      // Check if expired
      if (Date.now() > existing.expiresAt) {
        this.entries.delete(scoped);
        // Key expired, removed on access
      } else {
        return existing;
      }
    }

    // First writer wins - create a new entry in "processing" state
    const entry: IdempotencyEntry = {
      key: scoped,
      userId,
      status: 'processing',
      response: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    };

    this.entries.set(scoped, entry);
    return null;
  }

  /**
   * Mark a key as completed and store the response.
   */
  complete(userId: string, key: string, response: StoredResponse): void {
    const scoped = this.scopedKey(userId, key);
    const entry = this.entries.get(scoped);

    if (!entry) {
      return;
    }

    entry.status = 'completed';
    entry.response = response;
  }

  /**
   * Remove a key (e.g., on processing failure so the client can retry).
   */
  remove(userId: string, key: string): void {
    const scoped = this.scopedKey(userId, key);
    this.entries.delete(scoped);
  }

  /**
   * Get an entry by userId and key.
   */
  get(userId: string, key: string): IdempotencyEntry | undefined {
    const scoped = this.scopedKey(userId, key);
    const entry = this.entries.get(scoped);

    if (entry && Date.now() > entry.expiresAt) {
      this.entries.delete(scoped);
      return undefined;
    }

    return entry;
  }

  /**
   * Remove all expired entries.
   */
  cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Get the number of active entries (for monitoring).
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Destroy the store and clear the cleanup timer.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.entries.clear();
  }
}
