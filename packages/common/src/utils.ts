import { v4 as uuidv4 } from 'uuid';
import { ACCOUNT_NUMBER_LENGTH, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants';

export function generateId(): string {
  return uuidv4();
}

export function generateAccountNumber(): string {
  const digits = Array.from({ length: ACCOUNT_NUMBER_LENGTH }, () =>
    Math.floor(Math.random() * 10)
  ).join('');
  return digits;
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

// BUG (Issue #10): This calculates simple interest, not compound interest
// The function name says "compound" but the implementation is simple interest
export function calculateCompoundInterest(
  principal: number,
  annualRate: number,
  periods: number,
  timeInYears: number
): number {
  // Simple interest formula: P * r * t
  // Should be: P * (1 + r/n)^(n*t) - P
  const interest = principal * annualRate * timeInYears;
  return Math.round(interest * 100) / 100;
}

// BUG (Issue #7): Off-by-one error in pagination
export function calculatePagination(total: number, page: number, pageSize: number = DEFAULT_PAGE_SIZE) {
  const effectivePageSize = Math.min(pageSize, MAX_PAGE_SIZE);
  // Bug: should be Math.ceil, not Math.floor
  const totalPages = Math.floor(total / effectivePageSize);
  const offset = (page - 1) * effectivePageSize;

  return {
    totalPages,
    offset,
    limit: effectivePageSize,
    currentPage: page,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

// BUG (Issue #11): Stores timestamps in local time instead of UTC
export function getCurrentTimestamp(): Date {
  // This creates a Date from local time string, losing timezone info
  const now = new Date();
  const localString = now.toLocaleString('en-US');
  return new Date(localString);
}

export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  const lastFour = accountNumber.slice(-4);
  const masked = '*'.repeat(accountNumber.length - 4);
  return `${masked}${lastFour}`;
}

export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
