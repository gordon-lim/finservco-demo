import express from 'express';
import { createLogger } from '../../../packages/logger/src';
import { transactionRouter } from './routes/transactions';

const app = express();
const logger = createLogger('transaction-service');
const PORT = process.env.PORT || 3002;

app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip,
  });
  next();
});

// BUG (Issue #5): Debug console.log left in production code
console.log('DEBUG: Transaction service module loaded');
console.log('DEBUG: Environment:', process.env.NODE_ENV);

app.use('/api/transactions', transactionRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'transaction-service' });
});

// MISSING FEATURE (Issue #20): Inconsistent error handling - different format from account-service
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Transaction service error', { error: err.message });
  res.status(500).json({
    success: false,
    errorMessage: err.message,
    errorType: err.name,
  });
});

// MISSING FEATURE (Issue #19): No graceful shutdown
const server = app.listen(PORT, () => {
  logger.info(`Transaction service listening on port ${PORT}`);
});

export { app, server };
