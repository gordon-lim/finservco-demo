import express from 'express';
import { createLogger } from '../../../packages/logger/src';
import { notificationRouter } from './channels/notification-router';
import { EventEmitter } from 'events';

const app = express();
const logger = createLogger('notification-service');
const PORT = process.env.PORT || 3004;

app.use(express.json());

// BUG (Issue #18): Memory leak - EventEmitter listeners never cleaned up
// Every request adds a new listener, but they're never removed
const notificationBus = new EventEmitter();

// This grows unbounded over time - a classic memory leak
app.use((req, _res, next) => {
  // BUG: Adding listener on every request without removing old ones
  notificationBus.on('notification:sent', (data) => {
    logger.info('Notification sent event received', data);
  });

  notificationBus.on('notification:failed', (data) => {
    logger.warn('Notification failed event received', data);
  });

  next();
});

app.use('/api/notifications', notificationRouter);

app.get('/health', (_req, res) => {
  // BUG (Issue #18): Exposes the growing listener count
  const listenerCount = notificationBus.listenerCount('notification:sent');
  res.json({
    status: 'ok',
    service: 'notification-service',
    eventListeners: listenerCount, // This number grows with every request
  });
});

// MISSING FEATURE (Issue #20): Yet another error format
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Notification service error', { err: err.message });
  res.status(500).json({
    ok: false,
    reason: err.message,
  });
});

// MISSING FEATURE (Issue #19): No graceful shutdown
const server = app.listen(PORT, () => {
  logger.info(`Notification service listening on port ${PORT}`);
});

export { app, server, notificationBus };
