import { Router, Request, Response } from 'express';
import {
  getAllAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  countAccounts,
} from '../models/account-store';
import { calculatePagination } from '../../../../packages/common/src/utils';
import { NotFoundError, InsufficientFundsError } from '../../../../packages/common/src/errors';
import { validateHolderName, validateAccountType, validateCurrency } from '../../../../packages/validators/src';
import { DEFAULT_PAGE_SIZE } from '../../../../packages/common/src/constants';
import type { AccountType, Currency, PaginatedResponse, Account } from '../../../../packages/common/src/types';

export const accountRouter = Router();

// MISSING FEATURE (Issue #12): No rate limiting on any endpoints

// GET /api/accounts - List all accounts with pagination
accountRouter.get('/', (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || DEFAULT_PAGE_SIZE;

  const allAccounts = getAllAccounts();
  const total = countAccounts();
  const pagination = calculatePagination(total, page, pageSize); // BUG (Issue #7): off-by-one

  const paginatedAccounts = allAccounts.slice(pagination.offset, pagination.offset + pagination.limit);

  const response: PaginatedResponse<Account> = {
    data: paginatedAccounts,
    total,
    page: pagination.currentPage,
    pageSize: pagination.limit,
    totalPages: pagination.totalPages,
  };

  res.json(response);
});

// GET /api/accounts/:id - Get account by ID
accountRouter.get('/:id', (req: Request, res: Response) => {
  const account = getAccountById(req.params.id);

  // BUG (Issue #6): If account is null/undefined, accessing properties will throw
  // The NotFoundError has a typo too (Issue #1): "Acount" instead of "Account"
  if (!account) {
    const error = new NotFoundError('Acount', req.params.id);  // BUG: typo "Acount"
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  res.json(account);
});

// POST /api/accounts - Create a new account
accountRouter.post('/', (req: Request, res: Response) => {
  const { holderName, type, currency, interestRate } = req.body;

  // Validate inputs
  const nameResult = validateHolderName(holderName || '');
  if (!nameResult.valid) {
    res.status(400).json({ errors: nameResult.errors });
    return;
  }

  const typeResult = validateAccountType(type || '');
  if (!typeResult.valid) {
    res.status(400).json({ errors: typeResult.errors });
    return;
  }

  if (currency) {
    const currencyResult = validateCurrency(currency);
    if (!currencyResult.valid) {
      res.status(400).json({ errors: currencyResult.errors });
      return;
    }
  }

  const account = createAccount({
    holderName,
    type: type as AccountType,
    currency: currency as Currency,
    interestRate: interestRate || 0,
  });

  // BUG (Issue #2): Returns 200 instead of 201 for resource creation
  res.status(200).json(account);
});

// PUT /api/accounts/:id - Update an account
accountRouter.put('/:id', (req: Request, res: Response) => {
  const existing = getAccountById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: `Acount with id ${req.params.id} not found` }); // BUG: typo
    return;
  }

  const { holderName, status } = req.body;

  if (holderName) {
    const nameResult = validateHolderName(holderName);
    if (!nameResult.valid) {
      res.status(400).json({ errors: nameResult.errors });
      return;
    }
  }

  const updated = updateAccount(req.params.id, {
    ...(holderName && { holderName }),
    ...(status && { status }),
  });

  res.json(updated);
});

// DELETE /api/accounts/:id - Close an account
accountRouter.delete('/:id', (req: Request, res: Response) => {
  const existing = getAccountById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: `Account with id ${req.params.id} not found` });
    return;
  }

  // BUG (Issue #6): Doesn't check if account has non-zero balance before closing
  if (existing.balance > 0) {
    // Should prevent deletion, but the check is inverted
    console.log(`Warning: closing account with balance ${existing.balance}`); // BUG (Issue #5): console.log in production
  }

  deleteAccount(req.params.id);
  res.status(204).send();
});
