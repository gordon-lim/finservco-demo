import { validateAmount, validateAccountNumber, validateCurrency, validateHolderName, validateEmail, validateTransferRequest } from '../index';

describe('validateAmount', () => {
  it('should accept valid amounts', () => {
    expect(validateAmount(100).valid).toBe(true);
    expect(validateAmount(0.01).valid).toBe(true);
    expect(validateAmount(999999.99).valid).toBe(true);
  });

  it('should reject amounts below minimum', () => {
    const result = validateAmount(0.001);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amount must have at most 2 decimal places');
  });

  it('should reject amounts above maximum', () => {
    const result = validateAmount(1_000_001);
    expect(result.valid).toBe(false);
  });

  it('should reject NaN', () => {
    const result = validateAmount(NaN);
    expect(result.valid).toBe(false);
  });
});

describe('validateAccountNumber', () => {
  it('should accept valid account numbers', () => {
    expect(validateAccountNumber('123456789012').valid).toBe(true);
  });

  it('should reject wrong length', () => {
    expect(validateAccountNumber('12345').valid).toBe(false);
  });

  it('should reject non-numeric characters', () => {
    expect(validateAccountNumber('12345678901a').valid).toBe(false);
  });
});

describe('validateCurrency', () => {
  it('should accept supported currencies', () => {
    expect(validateCurrency('USD').valid).toBe(true);
    expect(validateCurrency('EUR').valid).toBe(true);
    expect(validateCurrency('GBP').valid).toBe(true);
  });

  it('should reject unsupported currencies', () => {
    expect(validateCurrency('BTC').valid).toBe(false);
  });
});

describe('validateHolderName', () => {
  it('should accept valid names', () => {
    expect(validateHolderName('John Smith').valid).toBe(true);
    expect(validateHolderName("Mary O'Brien").valid).toBe(true);
  });

  it('should reject empty names', () => {
    expect(validateHolderName('').valid).toBe(false);
  });

  it('should reject names with invalid characters', () => {
    expect(validateHolderName('John123').valid).toBe(false);
  });

  // BUG (Issue #3): This test SHOULD fail because whitespace names pass validation
  // But since the bug is that trim() is missing, "  John  " passes as-is
  it('should accept names with whitespace (bug: not trimmed)', () => {
    const result = validateHolderName('  John Smith  ');
    expect(result.valid).toBe(true); // Passes because no trim
  });
});

describe('validateEmail', () => {
  it('should accept valid emails', () => {
    expect(validateEmail('user@example.com').valid).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(validateEmail('not-an-email').valid).toBe(false);
    expect(validateEmail('@missing.com').valid).toBe(false);
  });
});

describe('validateTransferRequest', () => {
  it('should accept valid transfer requests', () => {
    const result = validateTransferRequest({
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 100,
      currency: 'USD',
    });
    expect(result.valid).toBe(true);
  });

  it('should reject same source and destination', () => {
    const result = validateTransferRequest({
      fromAccountId: 'acc-1',
      toAccountId: 'acc-1',
      amount: 100,
      currency: 'USD',
    });
    expect(result.valid).toBe(false);
  });

  it('should reject missing fields', () => {
    const result = validateTransferRequest({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
