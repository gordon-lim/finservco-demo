import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../../packages/logger/src';
import { assessTransactionRisk } from './rules/risk-rules';
import type { Transaction } from '../../../packages/common/src/types';

const app = express();
const logger = createLogger('risk-engine');
const PORT = process.env.PORT || 3003;

app.use(express.json());

app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// POST /api/risk/assess - Assess transaction risk
app.post('/api/risk/assess', (req: Request, res: Response) => {
  const transaction: Transaction = req.body;

  // MISSING FEATURE (Issue #16): No circuit breaker pattern
  // If this service is down, ALL transaction processing blocks
  // Should have a fallback or circuit breaker to degrade gracefully

  try {
    const correlationId = req.headers['x-correlation-id'] as string | undefined;
    const assessment = assessTransactionRisk(transaction, correlationId);
    logger.info('Risk assessment completed', {
      transactionId: transaction.id,
      riskLevel: assessment.riskLevel,
      score: assessment.score,
    });

    res.json(assessment);
  } catch (error) {
    // MISSING FEATURE (Issue #16): No circuit breaker - errors just propagate
    logger.error('Risk assessment failed', {
      transactionId: transaction.id,
      error: (error as Error).message,
    });
    res.status(500).json({ error: 'Risk assessment failed' });
  }
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'risk-engine' });
});

// MISSING FEATURE (Issue #20): Inconsistent error handling - yet another format
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Risk engine error', { message: err.message });
  res.status(500).json({
    status: 'error',
    msg: err.message,
  });
});

// MISSING FEATURE (Issue #19): No graceful shutdown
const server = app.listen(PORT, () => {
  logger.info(`Risk engine listening on port ${PORT}`);
});

export { app, server };
