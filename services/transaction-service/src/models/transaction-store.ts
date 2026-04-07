import type { Transaction, TransactionType, TransactionStatus, Currency } from '../../../../packages/common/src/types';
import { generateId, getCurrentTimestamp } from '../../../../packages/common/src/utils';

// In-memory store
const transactions: Map<string, Transaction> = new Map();

// MISSING FEATURE (Issue #15): No idempotency key tracking
// Duplicate transactions can be created on network retries
// const processedIdempotencyKeys: Set<string> = new Set();

export function getAllTransactions(): Transaction[] {
  return Array.from(transactions.values());
}

export function getTransactionById(id: string): Transaction | undefined {
  return transactions.get(id);
}

export function getTransactionsByAccountId(accountId: string): Transaction[] {
  return Array.from(transactions.values()).filter(
    (t) => t.fromAccountId === accountId || t.toAccountId === accountId
  );
}

// BUG (Issue #13): Broken pagination for transaction history
// Sort order is inconsistent - sometimes by createdAt, sometimes by id
export function getTransactionsPaginated(
  accountId: string,
  page: number,
  pageSize: number
): { transactions: Transaction[]; total: number } {
  const filtered = getTransactionsByAccountId(accountId);

  // BUG: Sort is non-deterministic for transactions with the same timestamp
  // This causes items to appear on multiple pages or be skipped entirely
  filtered.sort((a, b) => {
    const timeA = a.createdAt.getTime();
    const timeB = b.createdAt.getTime();
    if (timeA === timeB) {
      // Missing tiebreaker - should sort by id as secondary key
      return 0;
    }
    return timeB - timeA;
  });

  const offset = (page - 1) * pageSize;
  const paginated = filtered.slice(offset, offset + pageSize);

  return {
    transactions: paginated,
    total: filtered.length,
  };
}

export function createTransaction(data: {
  fromAccountId: string | null;
  toAccountId: string | null;
  type: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  reference?: string;
}): Transaction {
  // BUG (Issue #5): Debug logging left in production
  console.log('DEBUG: Creating transaction:', JSON.stringify(data));

  const now = getCurrentTimestamp(); // BUG (Issue #11): local time instead of UTC

  const transaction: Transaction = {
    id: generateId(),
    fromAccountId: data.fromAccountId,
    toAccountId: data.toAccountId,
    type: data.type,
    amount: data.amount,
    currency: data.currency,
    status: 'pending',
    description: data.description,
    reference: data.reference || generateId(),
    metadata: {},
    createdAt: now,
    completedAt: null,
  };

  transactions.set(transaction.id, transaction);
  return transaction;
}

export function updateTransactionStatus(
  id: string,
  status: TransactionStatus
): Transaction | undefined {
  const transaction = transactions.get(id);
  if (!transaction) return undefined;

  transaction.status = status;
  if (status === 'completed') {
    transaction.completedAt = getCurrentTimestamp();
  }

  transactions.set(id, transaction);
  return transaction;
}

export function getTransactionCount(): number {
  return transactions.size;
}
