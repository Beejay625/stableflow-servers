module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  watchPathIgnorePatterns: [
    'node_modules',
    'dist',
    'coverage',
    '.git'
  ],
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  watchman: true,
  testTimeout: 30000,
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  bail: false,
  verbose: true,
  notify: true,
  detectOpenHandles: true,
  forceExit: true,
  runInBand: false,
  cache: false,
}; 