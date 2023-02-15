import type { Config } from 'jest'

const config: Config = {
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/lib/**/*.(spec|test).ts'],

  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
  },
  testEnvironment: 'node',
  reporters: ['default'],
  // lib/index.ts is the imperative shell and will not be tested
  coveragePathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/coverage/', 'lib/index.ts'],
  coverageThreshold: {
    global: {
      statements: 96,
      branches: 84,
      functions: 90,
      lines: 96,
    },
  },
}

export default config