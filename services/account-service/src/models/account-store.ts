import type { Account, AccountType, Currency, AccountStatus } from '../../../../packages/common/src/types';
import { generateId, generateAccountNumber, getCurrentTimestamp } from '../../../../packages/common/src/utils';
import { DEFAULT_CURRENCY } from '../../../../packages/common/src/constants';

// In-memory store (would be a database in production)
const accounts: Map<string, Account> = new Map();

// Seed some demo accounts
function seedAccounts(): void {
  const demoAccounts: Omit<Account, 'id' | 'accountNumber' | 'createdAt' | 'updatedAt'>[] = [
    {
      holderName: 'John Smith',
      type: 'checking',
      currency: 'USD',
      balance: 5432.10,
      status: 'active',
      interestRate: 0.01,
    },
    {
      holderName: 'Jane Doe',
      type: 'savings',
      currency: 'USD',
      balance: 25000.00,
      status: 'active',
      interestRate: 0.045,
    },
    {
      holderName: 'Bob Wilson',
      type: 'investment',
      currency: 'EUR',
      balance: 150000.00,
      status: 'active',
      interestRate: 0.07,
    },
    {
      holderName: 'Alice Brown',
      type: 'checking',
      currency: 'GBP',
      balance: 1200.50,
      status: 'suspended',
      interestRate: 0.005,
    },
  ];

  for (const data of demoAccounts) {
    const now = getCurrentTimestamp();
    const account: Account = {
      id: generateId(),
      accountNumber: generateAccountNumber(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    accounts.set(account.id, account);
  }
}

seedAccounts();

export function getAllAccounts(): Account[] {
  return Array.from(accounts.values());
}

export function getAccountById(id: string): Account | undefined {
  return accounts.get(id);
}

export function getAccountByNumber(accountNumber: string): Account | undefined {
  return Array.from(accounts.values()).find(a => a.accountNumber === accountNumber);
}

export function createAccount(data: {
  holderName: string;
  type: AccountType;
  currency?: Currency;
  interestRate?: number;
}): Account {
  const now = getCurrentTimestamp();

  // BUG (Issue #3): holderName not trimmed before storing
  // BUG (Issue #4): Falls back to DEFAULT_CURRENCY ('USD') instead of using provided currency
  const account: Account = {
    id: generateId(),
    accountNumber: generateAccountNumber(),
    holderName: data.holderName,  // Should be data.holderName.trim()
    type: data.type,
    currency: DEFAULT_CURRENCY as Currency,  // BUG: ignores data.currency
    balance: 0,
    status: 'active',
    interestRate: data.interestRate || 0,
    createdAt: now,
    updatedAt: now,
  };

  accounts.set(account.id, account);
  return account;
}

export function updateAccount(id: string, updates: Partial<Account>): Account | undefined {
  const account = accounts.get(id);
  if (!account) return undefined;

  const updated: Account = {
    ...account,
    ...updates,
    id: account.id, // Prevent id from being changed
    accountNumber: account.accountNumber, // Prevent account number from being changed
    updatedAt: getCurrentTimestamp(),
  };

  accounts.set(id, updated);
  return updated;
}

// BUG (Issue #8): No locking mechanism for concurrent balance updates
export function updateBalance(id: string, newBalance: number): Account | undefined {
  const account = accounts.get(id);
  if (!account) return undefined;

  // Race condition: read-modify-write without any synchronization
  // If two concurrent requests read the same balance, one update will be lost
  account.balance = newBalance;
  account.updatedAt = getCurrentTimestamp();
  accounts.set(id, account);
  return account;
}

export function deleteAccount(id: string): boolean {
  return accounts.delete(id);
}

export function countAccounts(): number {
  return accounts.size;
}
