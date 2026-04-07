export const MAX_TRANSACTION_AMOUNT = 1_000_000;
export const MIN_TRANSACTION_AMOUNT = 0.01;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const ACCOUNT_NUMBER_LENGTH = 12;

// BUG (Issue #4): Hardcoded currency - should be configurable per account
export const DEFAULT_CURRENCY = 'USD';

export const INTEREST_COMPOUNDING_PERIODS = 12; // monthly

export const RISK_SCORE_THRESHOLDS = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 90,
} as const;

export const TRANSACTION_TIMEOUT_MS = 30_000;

export const MAX_DAILY_TRANSACTIONS = 100;
export const MAX_DAILY_TRANSFER_AMOUNT = 50_000;

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'] as const;

export const NOTIFICATION_RETRY_ATTEMPTS = 3;
export const NOTIFICATION_RETRY_DELAY_MS = 1_000;
