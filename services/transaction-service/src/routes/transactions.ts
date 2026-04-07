import { Router, Request, Response } from 'express';
import {
  getAllTransactions,
  getTransactionById,
  getTransactionsByAccountId,
  getTransactionsPaginated,
  createTransaction,
  updateTransactionStatus,
} from '../models/transaction-store';
import { validateAmount, validateCurrency, validateTransferRequest } from '../../../../packages/validators/src';
import { DEFAULT_CURRENCY, DEFAULT_PAGE_SIZE } from '../../../../packages/common/src/constants';
import type { Currency } from '../../../../packages/common/src/types';
import { createLogger } from '../../../../packages/logger/src';
import { emitAuditEvent, createCorrelationId } from '../../../../packages/common/src/audit';

const logger = createLogger('transaction-routes');
const SERVICE_NAME = 'transaction-service';

export const transactionRouter = Router();

// MISSING FEATURE (Issue #12): No rate limiting

// GET /api/transactions - List all transactions
transactionRouter.get('/', (req: Request, res: Response) => {
  const { accountId, page, pageSize } = req.query;

  if (accountId) {
    const pageNum = parseInt(page as string) || 1;
    const size = parseInt(pageSize as string) || DEFAULT_PAGE_SIZE;

    // BUG (Issue #13): Pagination is broken - inconsistent sort order
    const result = getTransactionsPaginated(accountId as string, pageNum, size);
    res.json({
      data: result.transactions,
      total: result.total,
      page: pageNum,
      pageSize: size,
    });
    return;
  }

  const transactions = getAllTransactions();
  res.json({ data: transactions, total: transactions.length });
});

// GET /api/transactions/:id - Get transaction by ID
transactionRouter.get('/:id', (req: Request, res: Response) => {
  const transaction = getTransactionById(req.params.id);

  if (!transaction) {
    res.status(404).json({ error: `Transaction with id ${req.params.id} not found` });
    return;
  }

  res.json(transaction);
});

// POST /api/transactions/deposit - Create a deposit
transactionRouter.post('/deposit', (req: Request, res: Response) => {
  const { accountId, amount, currency, description } = req.body;

  if (!accountId) {
    res.status(400).json({ error: 'Account ID is required' });
    return;
  }

  const amountResult = validateAmount(amount);
  if (!amountResult.valid) {
    res.status(400).json({ errors: amountResult.errors });
    return;
  }

  // BUG (Issue #4): Hardcoded currency - ignores the currency parameter
  const txCurrency = DEFAULT_CURRENCY as Currency;

  const correlationId = (req.headers['x-correlation-id'] as string) || createCorrelationId();

  const transaction = createTransaction({
    fromAccountId: null,
    toAccountId: accountId,
    type: 'deposit',
    amount,
    currency: txCurrency, // Should be: currency || txCurrency
    description: description || 'Deposit',
  });

  emitAuditEvent({
    eventType: 'TRANSACTION_INITIATED',
    aggregateType: 'Transaction',
    aggregateId: transaction.id,
    actorId: (req.headers['x-actor-id'] as string) || 'system',
    actorType: (req.headers['x-actor-id'] ? 'user' : 'system') as 'user' | 'system',
    correlationId,
    payload: {
      type: 'deposit',
      toAccountId: accountId,
      amount,
      currency: txCurrency,
    },
    service: SERVICE_NAME,
    ip: req.ip,
  });

  updateTransactionStatus(transaction.id, 'completed');

  emitAuditEvent({
    eventType: 'TRANSACTION_COMPLETED',
    aggregateType: 'Transaction',
    aggregateId: transaction.id,
    actorId: (req.headers['x-actor-id'] as string) || 'system',
    actorType: (req.headers['x-actor-id'] ? 'user' : 'system') as 'user' | 'system',
    correlationId,
    payload: {
      type: 'deposit',
      toAccountId: accountId,
      amount,
      currency: txCurrency,
      status: 'completed',
    },
    service: SERVICE_NAME,
    ip: req.ip,
  });

  // BUG (Issue #5): Console.log in production
  console.log('DEBUG: Deposit completed:', transaction.id, 'amount:', amount);

  res.status(201).json(transaction);
});

// POST /api/transactions/withdrawal - Create a withdrawal
transactionRouter.post('/withdrawal', (req: Request, res: Response) => {
  const { accountId, amount, currency, description } = req.body;

  if (!accountId) {
    res.status(400).json({ error: 'Account ID is required' });
    return;
  }

  const amountResult = validateAmount(amount);
  if (!amountResult.valid) {
    res.status(400).json({ errors: amountResult.errors });
    return;
  }

  // BUG (Issue #6): No null check - should verify account exists before proceeding
  // In a real system this would call the account service

  const correlationId = (req.headers['x-correlation-id'] as string) || createCorrelationId();

  const transaction = createTransaction({
    fromAccountId: accountId,
    toAccountId: null,
    type: 'withdrawal',
    amount,
    currency: (currency as Currency) || (DEFAULT_CURRENCY as Currency),
    description: description || 'Withdrawal',
  });

  emitAuditEvent({
    eventType: 'TRANSACTION_INITIATED',
    aggregateType: 'Transaction',
    aggregateId: transaction.id,
    actorId: (req.headers['x-actor-id'] as string) || 'system',
    actorType: (req.headers['x-actor-id'] ? 'user' : 'system') as 'user' | 'system',
    correlationId,
    payload: {
      type: 'withdrawal',
      fromAccountId: accountId,
      amount,
      currency: (currency as Currency) || (DEFAULT_CURRENCY as Currency),
    },
    service: SERVICE_NAME,
    ip: req.ip,
  });

  updateTransactionStatus(transaction.id, 'completed');

  emitAuditEvent({
    eventType: 'TRANSACTION_COMPLETED',
    aggregateType: 'Transaction',
    aggregateId: transaction.id,
    actorId: (req.headers['x-actor-id'] as string) || 'system',
    actorType: (req.headers['x-actor-id'] ? 'user' : 'system') as 'user' | 'system',
    correlationId,
    payload: {
      type: 'withdrawal',
      fromAccountId: accountId,
      amount,
      status: 'completed',
    },
    service: SERVICE_NAME,
    ip: req.ip,
  });

  res.status(201).json(transaction);
});

// POST /api/transactions/transfer - Create a transfer between accounts
transactionRouter.post('/transfer', (req: Request, res: Response) => {
  const { fromAccountId, toAccountId, amount, currency, description } = req.body;

  const validationResult = validateTransferRequest({
    fromAccountId,
    toAccountId,
    amount,
    currency,
  });

  if (!validationResult.valid) {
    res.status(400).json({ errors: validationResult.errors });
    return;
  }

  // MISSING FEATURE (Issue #15): No idempotency key support
  // If client retries, a duplicate transaction will be created

  const correlationId = (req.headers['x-correlation-id'] as string) || createCorrelationId();

  // BUG (Issue #9): Missing transaction rollback
  // Step 1: Debit the source account
  const debitTx = createTransaction({
    fromAccountId,
    toAccountId: null,
    type: 'withdrawal',
    amount,
    currency: currency as Currency,
    description: `Transfer to ${toAccountId}: ${description || ''}`,
  });

  emitAuditEvent({
    eventType: 'TRANSACTION_INITIATED',
    aggregateType: 'Transaction',
    aggregateId: debitTx.id,
    actorId: (req.headers['x-actor-id'] as string) || 'system',
    actorType: (req.headers['x-actor-id'] ? 'user' : 'system') as 'user' | 'system',
    correlationId,
    payload: {
      type: 'transfer-debit',
      fromAccountId,
      toAccountId,
      amount,
      currency,
    },
    service: SERVICE_NAME,
    ip: req.ip,
  });

  // Simulate possible failure in credit step
  // BUG: If this step fails, the debit is NOT rolled back
  try {
    // Step 2: Credit the destination account
    const creditTx = createTransaction({
      fromAccountId: null,
      toAccountId,
      type: 'deposit',
      amount,
      currency: currency as Currency,
      description: `Transfer from ${fromAccountId}: ${description || ''}`,
    });

    emitAuditEvent({
      eventType: 'TRANSACTION_INITIATED',
      aggregateType: 'Transaction',
      aggregateId: creditTx.id,
      actorId: (req.headers['x-actor-id'] as string) || 'system',
      actorType: (req.headers['x-actor-id'] ? 'user' : 'system') as 'user' | 'system',
      correlationId,
      payload: {
        type: 'transfer-credit',
        fromAccountId,
        toAccountId,
        amount,
        currency,
      },
      service: SERVICE_NAME,
      ip: req.ip,
    });

    updateTransactionStatus(debitTx.id, 'completed');
    updateTransactionStatus(creditTx.id, 'completed');

    emitAuditEvent({
      eventType: 'TRANSACTION_COMPLETED',
      aggregateType: 'Transaction',
      aggregateId: debitTx.id,
      actorId: (req.headers['x-actor-id'] as string) || 'system',
      actorType: (req.headers['x-actor-id'] ? 'user' : 'system') as 'user' | 'system',
      correlationId,
      payload: {
        type: 'transfer-debit',
        fromAccountId,
        amount,
        status: 'completed',
      },
      service: SERVICE_NAME,
      ip: req.ip,
    });

    emitAuditEvent({
      eventType: 'TRANSACTION_COMPLETED',
      aggregateType: 'Transaction',
      aggregateId: creditTx.id,
      actorId: (req.headers['x-actor-id'] as string) || 'system',
      actorType: (req.headers['x-actor-id'] ? 'user' : 'system') as 'user' | 'system',
      correlationId,
      payload: {
        type: 'transfer-credit',
        toAccountId,
        amount,
        status: 'completed',
      },
      service: SERVICE_NAME,
      ip: req.ip,
    });

    logger.info('Transfer completed', {
      debitTxId: debitTx.id,
      creditTxId: creditTx.id,
      amount,
    });

    res.status(201).json({
      debitTransaction: debitTx,
      creditTransaction: creditTx,
    });
  } catch (error) {
    // BUG (Issue #9): Debit transaction is left as 'pending' - should be rolled back
    logger.error('Transfer credit step failed', {
      debitTxId: debitTx.id,
      error: (error as Error).message,
    });

    // Debit is NOT reversed here - money is "lost"
    updateTransactionStatus(debitTx.id, 'failed');

    emitAuditEvent({
      eventType: 'TRANSACTION_FAILED',
      aggregateType: 'Transaction',
      aggregateId: debitTx.id,
      actorId: (req.headers['x-actor-id'] as string) || 'system',
      actorType: (req.headers['x-actor-id'] ? 'user' : 'system') as 'user' | 'system',
      correlationId,
      payload: {
        type: 'transfer',
        fromAccountId,
        toAccountId,
        amount,
        error: (error as Error).message,
        failedStep: 'credit',
      },
      service: SERVICE_NAME,
      ip: req.ip,
    });

    res.status(500).json({
      error: 'Transfer failed during credit step',
      debitTransactionId: debitTx.id,
    });
  }
});
