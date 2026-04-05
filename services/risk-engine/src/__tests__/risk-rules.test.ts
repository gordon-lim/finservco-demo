import { assessTransactionRisk } from '../rules/risk-rules';
import type { Transaction } from '../../../../packages/common/src/types';

function createMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-test-001',
    fromAccountId: 'acc-001',
    toAccountId: 'acc-002',
    type: 'transfer',
    amount: 100,
    currency: 'USD',
    status: 'pending',
    description: 'Test transaction',
    reference: 'ref-001',
    metadata: {},
    createdAt: new Date('2024-01-15T14:00:00Z'), // 2pm UTC - business hours
    completedAt: null,
    ...overrides,
  };
}

describe('assessTransactionRisk', () => {
  it('should return low risk for normal transactions', () => {
    const tx = createMockTransaction({ amount: 50 });
    const assessment = assessTransactionRisk(tx);
    expect(assessment.riskLevel).toBe('low');
    expect(assessment.score).toBeLessThan(25);
  });

  it('should flag high-amount transactions', () => {
    const tx = createMockTransaction({ amount: 15000 });
    const assessment = assessTransactionRisk(tx);
    expect(assessment.score).toBeGreaterThan(0);
    expect(assessment.flags.some(f => f.includes('high-amount'))).toBe(true);
  });

  it('should flag round amounts as potential structuring', () => {
    const tx = createMockTransaction({ amount: 5000 });
    const assessment = assessTransactionRisk(tx);
    expect(assessment.flags.some(f => f.includes('round-amount'))).toBe(true);
  });

  it('should flag non-USD transactions', () => {
    const tx = createMockTransaction({ currency: 'EUR', amount: 100 });
    const assessment = assessTransactionRisk(tx);
    expect(assessment.flags.some(f => f.includes('cross-currency'))).toBe(true);
  });

  it('should flag late-night transactions', () => {
    const tx = createMockTransaction({
      createdAt: new Date('2024-01-15T02:00:00Z'), // 2am UTC
    });
    const assessment = assessTransactionRisk(tx);
    expect(assessment.flags.some(f => f.includes('late-night'))).toBe(true);
  });

  it('should cap risk score at 100', () => {
    const tx = createMockTransaction({
      amount: 50000,
      currency: 'EUR',
      createdAt: new Date('2024-01-15T03:00:00Z'),
    });
    const assessment = assessTransactionRisk(tx);
    expect(assessment.score).toBeLessThanOrEqual(100);
  });

  it('should mark high/critical risk for review', () => {
    const tx = createMockTransaction({
      amount: 50000,
      currency: 'EUR',
      createdAt: new Date('2024-01-15T03:00:00Z'),
    });
    const assessment = assessTransactionRisk(tx);
    expect(assessment.reviewRequired).toBe(true);
  });
});
