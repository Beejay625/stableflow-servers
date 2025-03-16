# StableFlow Backend Testing Guide

## Testing Structure

Tests in this project are organized into two main categories:

1. **Unit Tests** - Test individual components in isolation
2. **End-to-End (E2E) Tests** - Test complete features and API endpoints

### Module-Based Test Organization

Each module has its own `test` directory with the following structure:

```
src/modules/[module-name]/
├── test/
│   ├── unit/                # Unit tests for module components
│   │   ├── [service].spec.ts
│   │   ├── [controller].spec.ts
│   │   └── ...
│   ├── e2e/                 # E2E tests for module endpoints
│   │   ├── [feature].e2e-spec.ts
│   │   └── ...
│   └── index.spec.ts        # Main test file that imports all unit tests
```

## Running Tests

### Unit Tests

```bash
# Run all tests
npm run test

# Run tests for a specific module
npm run test -- src/modules/auth/test

# Run a specific test file
npm run test -- src/modules/auth/test/unit/auth.service.spec.ts
```

### E2E Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run e2e tests for a specific module
npm run test:e2e -- src/modules/auth/test/e2e

# Run a specific e2e test file
npm run test:e2e -- src/modules/auth/test/e2e/auth.e2e-spec.ts
```

## Test Utilities

Common test utilities are located in the main `test` directory:

- `test/database-test.module.ts` - Provides a test database configuration
- `test/jest.setup.ts` - Global Jest configuration and mocks
- `test/test-utils/` - Shared test utilities and helpers

## Writing Tests

### Unit Tests

Unit tests should:
- Test a single component in isolation
- Mock all external dependencies
- Focus on testing business logic
- Be fast and not require a database or external services

Example:
```typescript
describe('AuthService', () => {
  it('should generate a 6-digit OTP for existing user', async () => {
    // Test implementation
  });
});
```

### E2E Tests

E2E tests should:
- Test complete features from HTTP request to response
- Use the full application (or feature module)
- Test API contracts and responses
- Verify integration between components

Example:
```typescript
describe('/api/v1/auth/request-otp (POST)', () => {
  it('should generate OTP for valid email', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/request-otp')
      .send({ email: 'test@example.com' })
      .expect(201);
  });
});
```

## Best Practices

1. **Write Tests First** - Consider Test-Driven Development (TDD)
2. **Keep Tests Fast** - Use mocks and limit database operations
3. **One Assertion Per Test** - Focus each test on a single behavior
4. **Clear Test Names** - Describe what's being tested
5. **Use Realistic Test Data** - Test with data similar to production
6. **Test Edge Cases** - Consider error conditions and boundary cases 