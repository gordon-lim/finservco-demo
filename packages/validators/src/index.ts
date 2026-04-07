import {
  MIN_TRANSACTION_AMOUNT,
  MAX_TRANSACTION_AMOUNT,
  ACCOUNT_NUMBER_LENGTH,
  SUPPORTED_CURRENCIES,
} from '../../common/src/constants';
import type { Currency, AccountType, TransactionType } from '../../common/src/types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAmount(amount: number): ValidationResult {
  const errors: string[] = [];

  if (typeof amount !== 'number' || isNaN(amount)) {
    errors.push('Amount must be a valid number');
  } else {
    if (amount < MIN_TRANSACTION_AMOUNT) {
      errors.push(`Amount must be at least ${MIN_TRANSACTION_AMOUNT}`);
    }
    if (amount > MAX_TRANSACTION_AMOUNT) {
      errors.push(`Amount must not exceed ${MAX_TRANSACTION_AMOUNT}`);
    }
    // Check for more than 2 decimal places
    const decimals = amount.toString().split('.')[1];
    if (decimals && decimals.length > 2) {
      errors.push('Amount must have at most 2 decimal places');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAccountNumber(accountNumber: string): ValidationResult {
  const errors: string[] = [];

  if (!accountNumber) {
    errors.push('Account number is required');
  } else {
    if (accountNumber.length !== ACCOUNT_NUMBER_LENGTH) {
      errors.push(`Account number must be exactly ${ACCOUNT_NUMBER_LENGTH} digits`);
    }
    if (!/^\d+$/.test(accountNumber)) {
      errors.push('Account number must contain only digits');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateCurrency(currency: string): ValidationResult {
  const errors: string[] = [];

  if (!currency) {
    errors.push('Currency is required');
  } else if (!SUPPORTED_CURRENCIES.includes(currency as Currency)) {
    errors.push(`Unsupported currency: ${currency}. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

// BUG (Issue #3): Missing trim on holder name - allows leading/trailing whitespace
export function validateHolderName(name: string): ValidationResult {
  const errors: string[] = [];

  if (!name) {
    errors.push('Holder name is required');
  } else {
    // Note: should trim the name before validation, but doesn't
    if (name.length < 2) {
      errors.push('Holder name must be at least 2 characters');
    }
    if (name.length > 100) {
      errors.push('Holder name must not exceed 100 characters');
    }
    if (/[^a-zA-Z\s\-'.]/g.test(name)) {
      errors.push('Holder name contains invalid characters');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAccountType(type: string): ValidationResult {
  const errors: string[] = [];
  const validTypes: AccountType[] = ['checking', 'savings', 'investment', 'credit'];

  if (!type) {
    errors.push('Account type is required');
  } else if (!validTypes.includes(type as AccountType)) {
    errors.push(`Invalid account type: ${type}. Valid types: ${validTypes.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateTransactionType(type: string): ValidationResult {
  const errors: string[] = [];
  const validTypes: TransactionType[] = ['deposit', 'withdrawal', 'transfer', 'payment', 'refund'];

  if (!type) {
    errors.push('Transaction type is required');
  } else if (!validTypes.includes(type as TransactionType)) {
    errors.push(`Invalid transaction type: ${type}. Valid types: ${validTypes.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email) {
    errors.push('Email is required');
  } else if (!emailRegex.test(email)) {
    errors.push('Invalid email format');
  }

  return { valid: errors.length === 0, errors };
}

export function validateTransferRequest(request: {
  fromAccountId?: string;
  toAccountId?: string;
  amount?: number;
  currency?: string;
}): ValidationResult {
  const errors: string[] = [];

  if (!request.fromAccountId) {
    errors.push('Source account ID is required');
  }
  if (!request.toAccountId) {
    errors.push('Destination account ID is required');
  }
  if (request.fromAccountId && request.toAccountId && request.fromAccountId === request.toAccountId) {
    errors.push('Source and destination accounts must be different');
  }

  if (request.amount !== undefined) {
    const amountResult = validateAmount(request.amount);
    errors.push(...amountResult.errors);
  } else {
    errors.push('Amount is required');
  }

  if (request.currency) {
    const currencyResult = validateCurrency(request.currency);
    errors.push(...currencyResult.errors);
  } else {
    errors.push('Currency is required');
  }

  return { valid: errors.length === 0, errors };
}
