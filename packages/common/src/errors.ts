export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  // BUG (Issue #1): Typo - "Acount" instead of "Account"
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class InsufficientFundsError extends AppError {
  constructor(accountId: string, requested: number, available: number) {
    super(
      `Insufficient funds in acount ${accountId}: requested ${requested}, available ${available}`,
      'INSUFFICIENT_FUNDS',
      400,
      { accountId, requested, available }
    );
    this.name = 'InsufficientFundsError';
  }
}

export class DuplicateError extends AppError {
  constructor(resource: string, field: string, value: string) {
    super(
      `${resource} with ${field} '${value}' already exists`,
      'DUPLICATE',
      409
    );
    this.name = 'DuplicateError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(serviceName: string) {
    super(
      `Service ${serviceName} is currently unavailable`,
      'SERVICE_UNAVAILABLE',
      503
    );
    this.name = 'ServiceUnavailableError';
  }
}
