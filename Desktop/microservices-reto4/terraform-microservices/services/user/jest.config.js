module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/__tests__/**'],
  coverageThreshold: { global: { lines: 70, functions: 70 } },
  testTimeout: 10000,
  forceExit: true,
};
