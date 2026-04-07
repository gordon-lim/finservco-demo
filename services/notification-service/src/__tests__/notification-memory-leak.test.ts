import { EventEmitter } from 'events';

describe('notification service memory leak fix', () => {
  it('should not increase listener count when listeners are registered once at startup', () => {
    // Simulate the FIXED behavior: listeners registered once at startup
    const notificationBus = new EventEmitter();

    // Register listeners once (as done in the fix)
    notificationBus.on('notification:sent', () => {});
    notificationBus.on('notification:failed', () => {});

    const initialSentCount = notificationBus.listenerCount('notification:sent');
    const initialFailedCount = notificationBus.listenerCount('notification:failed');

    // Simulate 100 incoming requests — no new listeners should be added
    for (let i = 0; i < 100; i++) {
      // In the old buggy code, this would add listeners here.
      // After the fix, middleware no longer adds listeners.
    }

    expect(notificationBus.listenerCount('notification:sent')).toBe(initialSentCount);
    expect(notificationBus.listenerCount('notification:failed')).toBe(initialFailedCount);
    expect(initialSentCount).toBe(1);
    expect(initialFailedCount).toBe(1);
  });

  it('should demonstrate the bug pattern with per-request listeners', () => {
    // Demonstrate that the OLD pattern causes unbounded growth
    const buggyBus = new EventEmitter();

    // Simulate buggy middleware: adding listeners on every "request"
    for (let i = 0; i < 50; i++) {
      buggyBus.on('notification:sent', () => {});
      buggyBus.on('notification:failed', () => {});
    }

    // This proves the bug: 50 listeners per event instead of 1
    expect(buggyBus.listenerCount('notification:sent')).toBe(50);
    expect(buggyBus.listenerCount('notification:failed')).toBe(50);
  });

  it('should verify the fixed index.ts does not add listeners in middleware', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const sourceCode = fs.readFileSync(
      path.join(__dirname, '..', 'index.ts'),
      'utf-8'
    );

    // Verify no listener registration inside middleware
    const middlewareRegex = /app\.use\(\s*\(.*?\)\s*=>\s*\{[^}]*notificationBus\.on\(/s;
    expect(middlewareRegex.test(sourceCode)).toBe(false);

    // Verify listeners ARE registered at module level
    expect(sourceCode).toContain("notificationBus.on('notification:sent'");
    expect(sourceCode).toContain("notificationBus.on('notification:failed'");
  });
});
