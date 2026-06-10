/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@db/(.*)$': '<rootDir>/src/db/$1',
    '^@providers/(.*)$': '<rootDir>/src/providers/$1',
    '^@sockets/(.*)$': '<rootDir>/src/sockets/$1',
    '^@jobs/(.*)$': '<rootDir>/src/jobs/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/db/seed.ts'],
  coverageDirectory: 'coverage',
};
