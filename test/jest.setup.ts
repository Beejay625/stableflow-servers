import { ConfigModule } from '@nestjs/config';

// Set test environment
process.env.NODE_ENV = 'test';

// Extend Jest matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Global test timeout
jest.setTimeout(10000);

// Mock ConfigService for all tests by default
jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockImplementation((key: string) => {
      switch (key) {
        case 'REDIS_HOST':
          return 'localhost';
        case 'REDIS_PORT':
          return 6379;
        case 'REDIS_PASSWORD':
          return 'test-password';
        case 'UPSTASH_REDIS_REST_URL':
          return 'https://test-url';
        case 'UPSTASH_REDIS_REST_TOKEN':
          return 'test-token';
        default:
          return undefined;
      }
    }),
  })),
})); 