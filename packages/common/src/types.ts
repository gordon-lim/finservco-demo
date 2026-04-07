export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD';

export type AccountStatus = 'active' | 'suspended' | 'closed' | 'pending';

export type AccountType = 'checking' | 'savings' | 'investment' | 'credit';

export type TransactionType = 'deposit' | 'withdrawal' | 'transfer' | 'payment' | 'refund';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'reversed';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type NotificationChannel = 'email' | 'sms' | 'push' | 'slack';

export interface Account {
  id: string;
  accountNumber: string;
  holderName: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  status: AccountStatus;
  interestRate: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  type: TransactionType;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  description: string;
  reference: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  completedAt: Date | null;
}

export interface RiskAssessment {
  transactionId: string;
  riskLevel: RiskLevel;
  score: number;
  flags: string[];
  reviewRequired: boolean;
  assessedAt: Date;
}

export interface Notification {
  id: string;
  accountId: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface TransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: Currency;
  description?: string;
}

export interface DepositRequest {
  accountId: string;
  amount: number;
  currency: Currency;
  description?: string;
}

export interface WithdrawalRequest {
  accountId: string;
  amount: number;
  currency: Currency;
  description?: string;
}
