import type { Transaction, RiskAssessment, RiskLevel } from '../../../../packages/common/src/types';
import { RISK_SCORE_THRESHOLDS, MAX_DAILY_TRANSFER_AMOUNT } from '../../../../packages/common/src/constants';
import { getCurrentTimestamp } from '../../../../packages/common/src/utils';

interface RiskRule {
  name: string;
  evaluate: (transaction: Transaction) => number;
  description: string;
}

const riskRules: RiskRule[] = [
  {
    name: 'high-amount',
    description: 'Flag transactions over $10,000 (CTR threshold)',
    evaluate: (tx: Transaction): number => {
      if (tx.amount >= 10000) return 30;
      if (tx.amount >= 5000) return 15;
      if (tx.amount >= 1000) return 5;
      return 0;
    },
  },
  {
    name: 'round-amount',
    description: 'Flag suspicious round amounts (structuring indicator)',
    evaluate: (tx: Transaction): number => {
      if (tx.amount % 1000 === 0 && tx.amount >= 5000) return 20;
      if (tx.amount % 100 === 0 && tx.amount >= 1000) return 10;
      return 0;
    },
  },
  {
    name: 'cross-currency',
    description: 'Flag cross-currency transactions',
    evaluate: (tx: Transaction): number => {
      // Note: this rule is incomplete - it doesn't actually check if source/dest have different currencies
      // It just flags non-USD transactions
      if (tx.currency !== 'USD') return 15;
      return 0;
    },
  },
  {
    name: 'high-frequency',
    description: 'Flag if account has many recent transactions',
    evaluate: (_tx: Transaction): number => {
      // MISSING FEATURE: This rule doesn't actually check transaction frequency
      // It would need access to the transaction store, but has no dependency injection
      // Always returns 0 - effectively a no-op
      return 0;
    },
  },
  {
    name: 'late-night',
    description: 'Flag transactions outside business hours',
    evaluate: (tx: Transaction): number => {
      const hour = tx.createdAt.getHours();
      if (hour >= 23 || hour <= 5) return 15;
      return 0;
    },
  },
];

function calculateRiskLevel(score: number): RiskLevel {
  if (score >= RISK_SCORE_THRESHOLDS.critical) return 'critical';
  if (score >= RISK_SCORE_THRESHOLDS.high) return 'high';
  if (score >= RISK_SCORE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

export function assessTransactionRisk(transaction: Transaction): RiskAssessment {
  let totalScore = 0;
  const flags: string[] = [];

  for (const rule of riskRules) {
    const score = rule.evaluate(transaction);
    if (score > 0) {
      totalScore += score;
      flags.push(`${rule.name}: +${score} (${rule.description})`);
    }
  }

  // Cap score at 100
  totalScore = Math.min(totalScore, 100);

  const riskLevel = calculateRiskLevel(totalScore);

  return {
    transactionId: transaction.id,
    riskLevel,
    score: totalScore,
    flags,
    reviewRequired: riskLevel === 'high' || riskLevel === 'critical',
    assessedAt: getCurrentTimestamp(),
  };
}

// MISSING FEATURE (Issue #17): No audit trail for risk assessments
// Assessments should be persisted for compliance, but they're only returned and forgotten
