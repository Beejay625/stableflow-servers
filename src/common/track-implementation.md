# Common Directory Implementation Tracking

## Directory Structure
```
common/
├── config/
├── constants/
├── dto/
├── exceptions/
├── filters/
├── interceptors/
├── interfaces/
├── pipes/
├── services/
└── utils/
```

## Implementations

### 1. Exception Handling (`exceptions/`)
- **BaseException**: Base exception class for consistent error handling
- **ValidationException**: Handles validation errors with detailed constraints
- **HttpErrorException**: Custom HTTP error handling
- **BusinessException**: Domain-specific business logic errors

### 2. HTTP Utilities (`utils/`)
- **http.util.ts**:
  - `formatQueryParams`: Query parameter formatting
  - `handleAxiosError`: Axios error transformation
  - `retryWithBackoff`: Retry mechanism with exponential backoff
- **validation.util.ts**: Email validation utilities
- **encryption.service.ts**: Encryption/decryption utilities
- **alchemy.ts**: Alchemy API integration
- **custom-signer.ts**: Custom signing functionality
- **email.ts**: Email service utilities

### 3. Interceptors (`interceptors/`)
- **TransformInterceptor**: Response transformation
- Includes unit tests (`transform.interceptor.spec.ts`)

### 4. Filters (`filters/`)
- **HttpExceptionFilter**: Global exception handling
- Includes unit tests (`http-exception.filter.spec.ts`)

### 5. Services (`services/`)
- **BaseService**: Common service functionality with pagination
- **BaseHttpService**: HTTP service with retry and error handling

### 6. DTOs (`dto/`)
- **PaginationDto**: Pagination request parameters

### 7. Interfaces (`interfaces/`)
- **PaginationInterface**: Pagination response structure

### 8. Configuration (`config/`)
- **TypeORM Configuration**: Database connection settings
- Environment-specific configurations

### 9. Pipes (`pipes/`)
- **ValidationPipe**: Global request validation

## Usage Guidelines

1. **Error Handling**:
   - Always extend from `BaseException` for custom exceptions
   - Use `HttpExceptionFilter` for HTTP error responses
   - Include detailed error messages and codes

2. **HTTP Requests**:
   - Use `BaseHttpService` for external API calls
   - Implement retry mechanisms using `retryWithBackoff`
   - Format query parameters with `formatQueryParams`

3. **Validation**:
   - Use `ValidationPipe` for request validation
   - Implement custom validators as needed
   - Handle validation errors with `ValidationException`

4. **Pagination**:
   - Extend `BaseService` for paginated endpoints
   - Use `PaginationDto` for request parameters
   - Implement `PaginationInterface` for responses

## Testing
- Unit tests for interceptors and filters
- Test utilities in `__tests__` directory
- E2E test setup with `TestDatabaseModule`

## Recent Updates
- Added TypeORM configuration for test environment
- Implemented validation exception handling
- Enhanced HTTP utility error handling with proper typing
- Added retry mechanism with exponential backoff
- Implemented Paycrest and Blockradar API service wrappers with tests
- Added interfaces for external API requests and responses
