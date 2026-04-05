module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleNameMapper: {
    '@finservco/common': '<rootDir>/packages/common/src',
    '@finservco/logger': '<rootDir>/packages/logger/src',
    '@finservco/validators': '<rootDir>/packages/validators/src',
  },
  collectCoverageFrom: [
    '**/*.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
};
