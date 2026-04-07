import {
  createTransaction,
  getTransactionsPaginated,
} from '../models/transaction-store';

describe('getTransactionsPaginated', () => {
  const accountId = 'test-account-1';

  beforeAll(() => {
    // Create several transactions with the same timestamp to test deterministic ordering
    const fixedTime = new Date('2025-01-15T12:00:00.000Z');
    const laterTime = new Date('2025-01-15T13:00:00.000Z');

    // Use a fixed Date so all transactions within each batch share a timestamp
    const originalDate = global.Date;
    const mockDate = class extends originalDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(fixedTime.getTime());
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          super(...(args as [any]));
        }
      }
    } as DateConstructor;
    global.Date = mockDate;

    // Create 5 transactions that will share the same createdAt timestamp
    for (let i = 0; i < 5; i++) {
      createTransaction({
        fromAccountId: accountId,
        toAccountId: null,
        type: 'withdrawal',
        amount: 100 + i,
        currency: 'USD',
        description: `Same-timestamp txn ${i}`,
      });
    }

    // Restore Date temporarily to set a different timestamp for the next batch
    global.Date = originalDate;
    const mockDate2 = class extends originalDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(laterTime.getTime());
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          super(...(args as [any]));
        }
      }
    } as DateConstructor;
    global.Date = mockDate2;

    // Create 3 more transactions at a later time
    for (let i = 0; i < 3; i++) {
      createTransaction({
        fromAccountId: accountId,
        toAccountId: null,
        type: 'withdrawal',
        amount: 200 + i,
        currency: 'USD',
        description: `Later txn ${i}`,
      });
    }

    global.Date = originalDate;
  });

  it('should produce consistent pagination with no duplicates or gaps for same-timestamp transactions', () => {
    const pageSize = 3;
    const allIds = new Set<string>();
    const orderedIds: string[] = [];

    // Fetch all pages
    const { total } = getTransactionsPaginated(accountId, 1, pageSize);
    const totalPages = Math.ceil(total / pageSize);

    for (let page = 1; page <= totalPages; page++) {
      const result = getTransactionsPaginated(accountId, page, pageSize);
      for (const txn of result.transactions) {
        orderedIds.push(txn.id);
        allIds.add(txn.id);
      }
    }

    // No duplicates: unique ids should equal total ids collected
    expect(allIds.size).toBe(total);
    expect(orderedIds.length).toBe(total);
  });

  it('should return the same order on repeated calls to the same page', () => {
    const result1 = getTransactionsPaginated(accountId, 1, 3);
    const result2 = getTransactionsPaginated(accountId, 1, 3);

    const ids1 = result1.transactions.map((t) => t.id);
    const ids2 = result2.transactions.map((t) => t.id);

    expect(ids1).toEqual(ids2);
  });

  it('should sort by createdAt descending, then by id ascending as tiebreaker', () => {
    const { transactions } = getTransactionsPaginated(accountId, 1, 100);

    for (let i = 0; i < transactions.length - 1; i++) {
      const curr = transactions[i];
      const next = transactions[i + 1];
      const currTime = curr.createdAt.getTime();
      const nextTime = next.createdAt.getTime();

      if (currTime === nextTime) {
        // Same timestamp: ids should be in ascending order
        expect(curr.id.localeCompare(next.id)).toBeLessThan(0);
      } else {
        // Different timestamps: should be descending
        expect(currTime).toBeGreaterThan(nextTime);
      }
    }
  });
});
