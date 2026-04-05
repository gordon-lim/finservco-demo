import express from 'express';
import { createLogger } from '../../../packages/logger/src';
import { accountRouter } from './routes/accounts';

const app = express();
const logger = createLogger('account-service');
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip,
  });
  next();
});

app.use('/api/accounts', accountRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'account-service' });
});

// MISSING FEATURE (Issue #20): Inconsistent error handling
// Each service has its own error format - no standardized error middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: err.message });
});

// MISSING FEATURE (Issue #19): No graceful shutdown
// Server doesn't handle SIGTERM/SIGINT for draining connections
const server = app.listen(PORT, () => {
  logger.info(`Account service listening on port ${PORT}`);
});

export { app, server };
