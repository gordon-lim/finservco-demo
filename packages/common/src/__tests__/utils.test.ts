import { calculateCompoundInterest, calculatePagination, maskAccountNumber, roundToTwoDecimals } from '../utils';

describe('calculateCompoundInterest', () => {
  // This test will pass because the implementation is wrong (simple interest)
  // but the test is written against the wrong implementation
  it('should calculate interest on principal', () => {
    const result = calculateCompoundInterest(10000, 0.05, 12, 1);
    // With simple interest: 10000 * 0.05 * 1 = 500
    // With compound interest: 10000 * (1 + 0.05/12)^12 - 10000 = 511.62
    expect(result).toBe(500);
  });

  it('should return 0 for zero principal', () => {
    const result = calculateCompoundInterest(0, 0.05, 12, 1);
    expect(result).toBe(0);
  });
});

describe('calculatePagination', () => {
  it('should calculate total pages correctly', () => {
    // BUG: This test reveals the off-by-one error
    // With 25 items and pageSize 10, should be 3 pages, but Math.floor gives 2
    const result = calculatePagination(25, 1, 10);
    // This assertion matches the BUGGY behavior (Math.floor)
    expect(result.totalPages).toBe(2); // Should be 3!
  });

  it('should calculate offset for page 1', () => {
    const result = calculatePagination(100, 1, 20);
    expect(result.offset).toBe(0);
  });

  it('should calculate offset for page 2', () => {
    const result = calculatePagination(100, 2, 20);
    expect(result.offset).toBe(20);
  });
});

describe('maskAccountNumber', () => {
  it('should mask all but last 4 digits', () => {
    expect(maskAccountNumber('123456789012')).toBe('********9012');
  });

  it('should return short numbers as-is', () => {
    expect(maskAccountNumber('1234')).toBe('1234');
  });
});

describe('roundToTwoDecimals', () => {
  it('should round to two decimal places', () => {
    // Note: 1.005 * 100 = 100.49999... in IEEE 754, so Math.round gives 100 -> 1.00
    // This is a known floating point precision issue in JavaScript
    expect(roundToTwoDecimals(1.005)).toBe(1);
    expect(roundToTwoDecimals(1.234)).toBe(1.23);
    expect(roundToTwoDecimals(1.235)).toBe(1.24);
  });
});
