import { createLogger } from '../../../packages/logger/src';
import { CircuitBreaker, riskEngineFallback } from '../../../packages/common/src/circuit-breaker';
import type { RiskAssessment, Transaction } from '../../../packages/common/src/types';

const logger = createLogger('risk-client');

const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL || 'http://localhost:3003';

const riskEngineBreaker = new CircuitBreaker('risk-engine', {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  monitorWindowMs: 60000,
  logger,
});

export async function assessTransactionRisk(transaction: Transaction): Promise<RiskAssessment> {
  return riskEngineBreaker.execute(
    async () => {
      const response = await fetch(`${RISK_ENGINE_URL}/api/risk/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction),
      });

      if (!response.ok) {
        throw new Error(`Risk engine returned ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<RiskAssessment>;
    },
    () => {
      const fallbackResult = riskEngineFallback(transaction.amount, logger);

      logger.warn('Using risk engine fallback for transaction', {
        transactionId: transaction.id,
        amount: transaction.amount,
        fallbackRiskLevel: fallbackResult.riskLevel,
      });

      const assessment: RiskAssessment = {
        transactionId: transaction.id,
        riskLevel: fallbackResult.riskLevel,
        score: fallbackResult.score,
        flags: fallbackResult.flags,
        reviewRequired: fallbackResult.reviewRequired,
        assessedAt: new Date(),
      };
      return assessment;
    },
  );
}

export function getRiskEngineCircuitState() {
  return riskEngineBreaker.getMetrics();
}
