<brainstorming>
# Analysis of Project Requirements

I'm analyzing a request to create an implementation plan for a Stableflow Platform backend using NestJS. The platform enables businesses to accept cryptocurrency payments and receive fiat settlements in their bank accounts.

Let's break down the key components from the technical specification:

## Core Modules Needed:
1. **Auth Module** - Already exists, handles authentication via email OTP
2. **Business Module** - Business onboarding, setup, bank account linking
3. **Wallet Module** - Generate and manage wallet addresses for EVM and Tron chains
4. **Transaction Module** - Track transaction lifecycle from receipt to processing
5. **Offramp Module** - Convert unsettled crypto to fiat and settle via Paycrest

## Database Entities (Using TypeORM):
1. **Business Entity** - Store business details and bank info
2. **Category Entity** - Business categories (predefined or custom)
3. **Wallet Address Entity** - Store generated crypto wallet addresses
4. **Transaction Entity** - Track transactions and their status

## External API Integrations:
1. **Paycrest** - For bank validation and fiat settlement
2. **Blockradar** - For wallet address generation and transaction management

## Key Workflows:
1. **Business Onboarding** - Authentication → Business Setup → Bank Account Linking → Wallet Generation
2. **Transaction Processing** - Capture via webhook → Store in database → Track status
3. **Offramp Processing** - Pick up unsettled transactions → Convert to fiat → Settle via Paycrest

## Implementation Approach:
I'll create a plan that follows best practices from the project rules:
- Test-Driven Development (TDD) - Write tests first, then implement
- Modular structure - One module per feature
- TypeORM for database operations
- Redis for transaction queuing
- Proper error handling with custom exceptions
- Documentation for each module

## Implementation Sequence:
1. Project setup with NestJS, TypeORM, PostgreSQL, Redis
2. Core module structure and database entities
3. Business module implementation
4. Wallet module implementation
5. Transaction module implementation
6. Offramp module implementation
7. Testing and documentation

For each module, I'll follow this sequence:
1. Define entities and DTOs
2. Write test cases (TDD approach)
3. Implement service layer
4. Implement controller layer
5. Add documentation
6. Set up integration with other modules

I need to ensure each step is atomic enough to be implemented by a code generation AI in a single iteration, while maintaining logical dependencies between steps.
</brainstorming>

# Implementation Plan

## Project Setup and Configuration
- [ ] Step 1: Initialize NestJS project and configure dependencies
  - **Task**: Create a new NestJS project, add required dependencies (TypeORM, PostgreSQL, Redis, Jest), and set up basic project structure
  - **Files**:
    - `package.json`: Add required dependencies
    - `tsconfig.json`: Configure TypeScript settings
    - `nest-cli.json`: Configure NestJS CLI settings
    - `.env`: Define environment variables
    - `.env.example`: Template for environment variables
    - `src/main.ts`: Setup NestJS application
    - `src/app.module.ts`: Root module configuration
    - `src/common/constants/env.constants.ts`: Environment constants
  - **User Instructions**: Run the following commands after this step is implemented:
    ```bash
    npm install
    ```

- [ ] Step 2: Configure TypeORM and database connection
  - **Task**: Set up TypeORM configuration for PostgreSQL and create database connection
  - **Files**:
    - `src/database/database.module.ts`: Database module configuration
    - `src/common/config/typeorm.config.ts`: TypeORM configuration
    - `src/app.module.ts`: Import database module
    - `test/database-test.module.ts`: Test database configuration
  - **Step Dependencies**: Step 1
  - **User Instructions**: Ensure PostgreSQL is running and accessible with credentials defined in `.env`

- [ ] Step 3: Configure Redis connection and queue management
  - **Task**: Set up Redis for queue management and caching
  - **Files**:
    - `src/modules/redis/redis.module.ts`: Redis module configuration
    - `src/modules/redis/redis.service.ts`: Redis service implementation
    - `src/app.module.ts`: Import Redis module
    - `test/redis-test.module.ts`: Test Redis configuration
  - **Step Dependencies**: Step 1
  - **User Instructions**: Ensure Redis is running and accessible with credentials defined in `.env`

- [ ] Step 4: Setup testing infrastructure
  - **Task**: Configure Jest and create test utilities
  - **Files**:
    - `jest.config.js`: Jest configuration
    - `test/jest.setup.ts`: Jest setup file
    - `test/test-utils/mock-repository.factory.ts`: Factory for repository mocks
    - `test/test-utils/test-data.builder.ts`: Test data builder utilities
  - **Step Dependencies**: Step 1
  - **User Instructions**: None

## Common Utilities and Shared Components
- [ ] Step A1: Create common interfaces, DTOs, and utility functions
  - **Task**: Implement common interfaces, DTOs, and utility functions for reuse across modules
  - **Files**:
    - `src/common/interfaces/pagination.interface.ts`: Pagination interface
    - `src/common/dto/pagination.dto.ts`: Pagination DTO
    - `src/common/utils/validation.util.ts`: Common validation utilities
    - `src/common/utils/http.util.ts`: HTTP request utilities for external APIs
    - `src/common/pipes/validation.pipe.ts`: Custom validation pipe
  - **Step Dependencies**: Step 1
  - **User Instructions**: None

- [ ] Step A2: Create custom exceptions and exception filters
  - **Task**: Create custom exception classes and exception filters for standardized error handling
  - **Files**:
    - `src/common/exceptions/base.exception.ts`: Base exception class
    - `src/common/exceptions/http-error.exception.ts`: HTTP error exception
    - `src/common/exceptions/validation.exception.ts`: Validation exception
    - `src/common/exceptions/business.exception.ts`: Business logic exceptions
    - `src/common/filters/http-exception.filter.ts`: HTTP exception filter
    - `src/common/filters/validation-exception.filter.ts`: Validation exception filter
  - **Step Dependencies**: Step 1
  - **User Instructions**: None

- [ ] Step A3: Create external API service wrappers
  - **Task**: Create service wrappers for external API calls to Paycrest and Blockradar
  - **Files**:
    - `src/modules/offramp/paycrest-api.service.ts`: Paycrest API service
    - `src/modules/wallet/blockradar-api.service.ts`: Blockradar API service
    - `src/modules/offramp/interfaces/paycrest.interface.ts`: Paycrest API interfaces
    - `src/modules/wallet/interfaces/blockradar.interface.ts`: Blockradar API interfaces
    - `src/modules/offramp/paycrest-api.service.spec.ts`: Test for Paycrest API service
    - `src/modules/wallet/blockradar-api.service.spec.ts`: Test for Blockradar API service
  - **Step Dependencies**: Step A1, Step A2
  - **User Instructions**: None

## Business Module Implementation
- [ ] Step B1: Create Business module entities and DTOs
  - **Task**: Define TypeORM entities for Business and Category, and create corresponding DTOs
  - **Files**:
    - `src/modules/business/entities/business.entity.ts`: Business entity
    - `src/modules/business/entities/category.entity.ts`: Category entity
    - `src/modules/business/dto/create-business.dto.ts`: Business creation DTO
    - `src/modules/business/dto/link-bank.dto.ts`: Bank linking DTO
    - `src/modules/business/interfaces/business.interface.ts`: Business interfaces
  - **Step Dependencies**: Step 2
  - **User Instructions**: None

- [ ] Step B2: Create Business Service tests
  - **Task**: Create unit tests for the Business Service following TDD principles
  - **Files**:
    - `src/modules/business/business.service.spec.ts`: Test for Business Service
    - `src/modules/business/docs/modulespec.md`: Business module specification
  - **Step Dependencies**: Step B1, Step 4
  - **User Instructions**: None

- [ ] Step B3: Implement Business Service
  - **Task**: Implement Business Service methods for business setup and bank account linking
  - **Files**:
    - `src/modules/business/business.service.ts`: Business Service implementation
    - `src/modules/business/docs/track-implementation.md`: Implementation tracking
  - **Step Dependencies**: Step B2, Step A3
  - **User Instructions**: None

- [ ] Step B4: Create Business Controller tests
  - **Task**: Create unit tests for the Business Controller following TDD principles
  - **Files**:
    - `src/modules/business/business.controller.spec.ts`: Test for Business Controller
  - **Step Dependencies**: Step B3
  - **User Instructions**: None

- [ ] Step B5: Implement Business Controller
  - **Task**: Implement Business Controller endpoints for business setup and bank account linking
  - **Files**:
    - `src/modules/business/business.controller.ts`: Business Controller implementation
    - `src/modules/business/business.module.ts`: Business Module configuration
  - **Step Dependencies**: Step B4
  - **User Instructions**: None

- [ ] Step B6: Create Business module integration tests
  - **Task**: Create integration tests for the Business module
  - **Files**:
    - `src/modules/business/test/e2e/business.e2e-spec.ts`: Integration test for Business module
  - **Step Dependencies**: Step B5
  - **User Instructions**: None

## Wallet Module Implementation
- [ ] Step C1: Create Wallet module entities and DTOs
  - **Task**: Define TypeORM entity for Wallet Address and create corresponding DTOs
  - **Files**:
    - `src/modules/wallet/entities/wallet-address.entity.ts`: Wallet Address entity
    - `src/modules/wallet/dto/generate-address.dto.ts`: Address generation DTO
    - `src/modules/wallet/interfaces/wallet.interface.ts`: Wallet interfaces
  - **Step Dependencies**: Step B1
  - **User Instructions**: None

- [ ] Step C2: Create Wallet Service tests
  - **Task**: Create unit tests for the Wallet Service following TDD principles
  - **Files**:
    - `src/modules/wallet/wallet.service.spec.ts`: Test for Wallet Service
    - `src/modules/wallet/docs/modulespec.md`: Wallet module specification
  - **Step Dependencies**: Step C1, Step 4
  - **User Instructions**: None

- [ ] Step C3: Implement Wallet Service
  - **Task**: Implement Wallet Service methods for wallet address generation and management
  - **Files**:
    - `src/modules/wallet/wallet.service.ts`: Wallet Service implementation
    - `src/modules/wallet/docs/track-implementation.md`: Implementation tracking
  - **Step Dependencies**: Step C2, Step A3, Step B3
  - **User Instructions**: None

- [ ] Step C4: Create Wallet Controller tests
  - **Task**: Create unit tests for the Wallet Controller following TDD principles
  - **Files**:
    - `src/modules/wallet/wallet.controller.spec.ts`: Test for Wallet Controller
  - **Step Dependencies**: Step C3
  - **User Instructions**: None

- [ ] Step C5: Implement Wallet Controller
  - **Task**: Implement Wallet Controller endpoints for wallet address generation and retrieval
  - **Files**:
    - `src/modules/wallet/wallet.controller.ts`: Wallet Controller implementation
    - `src/modules/wallet/wallet.module.ts`: Wallet Module configuration
  - **Step Dependencies**: Step C4
  - **User Instructions**: None

- [ ] Step C6: Create Wallet module integration tests
  - **Task**: Create integration tests for the Wallet module
  - **Files**:
    - `src/modules/wallet/test/e2e/wallet.e2e-spec.ts`: Integration test for Wallet module
  - **Step Dependencies**: Step C5
  - **User Instructions**: None

## Transaction Module Implementation
- [ ] Step D1: Create Transaction module entities and DTOs
  - **Task**: Define TypeORM entity for Transaction and create corresponding DTOs
  - **Files**:
    - `src/modules/transaction/entities/transaction.entity.ts`: Transaction entity
    - `src/modules/transaction/dto/webhook-payload.dto.ts`: Webhook payload DTO
    - `src/modules/transaction/interfaces/transaction.interface.ts`: Transaction interfaces
  - **Step Dependencies**: Step B1, Step C1
  - **User Instructions**: None

- [ ] Step D2: Create Transaction Service tests
  - **Task**: Create unit tests for the Transaction Service following TDD principles
  - **Files**:
    - `src/modules/transaction/transaction.service.spec.ts`: Test for Transaction Service
    - `src/modules/transaction/docs/modulespec.md`: Transaction module specification
  - **Step Dependencies**: Step D1, Step 4
  - **User Instructions**: None

- [ ] Step D3: Implement Transaction Service
  - **Task**: Implement Transaction Service methods for transaction processing and queuing
  - **Files**:
    - `src/modules/transaction/transaction.service.ts`: Transaction Service implementation
    - `src/modules/transaction/transaction.worker.ts`: Transaction worker for batch processing
    - `src/modules/transaction/docs/track-implementation.md`: Implementation tracking
  - **Step Dependencies**: Step D2, Step 3, Step A3
  - **User Instructions**: None

- [ ] Step D4: Create Transaction Controller tests
  - **Task**: Create unit tests for the Transaction Controller following TDD principles
  - **Files**:
    - `src/modules/transaction/transaction.controller.spec.ts`: Test for Transaction Controller
  - **Step Dependencies**: Step D3
  - **User Instructions**: None

- [ ] Step D5: Implement Transaction Controller
  - **Task**: Implement Transaction Controller endpoints for webhook handling and transaction retrieval
  - **Files**:
    - `src/modules/transaction/transaction.controller.ts`: Transaction Controller implementation
    - `src/modules/transaction/transaction.module.ts`: Transaction Module configuration
  - **Step Dependencies**: Step D4
  - **User Instructions**: None

- [ ] Step D6: Create transaction scheduling and safety checks
  - **Task**: Implement cron jobs for safety checks on transaction processing
  - **Files**:
    - `src/modules/transaction/transaction.schedule.ts`: Transaction scheduler
    - `src/modules/transaction/transaction.schedule.spec.ts`: Test for transaction scheduler
  - **Step Dependencies**: Step D5
  - **User Instructions**: None

- [ ] Step D7: Create Transaction module integration tests
  - **Task**: Create integration tests for the Transaction module
  - **Files**:
    - `src/modules/transaction/test/e2e/transaction.e2e-spec.ts`: Integration test for Transaction module
  - **Step Dependencies**: Step D6
  - **User Instructions**: None

## Offramp Module Implementation
- [ ] Step E1: Create Offramp module entities and DTOs
  - **Task**: Define TypeORM entity for Offramp Transaction and create corresponding DTOs
  - **Files**:
    - `src/modules/offramp/entities/offramp-transaction.entity.ts`: Offramp Transaction entity
    - `src/modules/offramp/dto/offramp-request.dto.ts`: Offramp request DTO
    - `src/modules/offramp/interfaces/offramp.interface.ts`: Offramp interfaces
  - **Step Dependencies**: Step D1
  - **User Instructions**: None

- [ ] Step E2: Create Offramp Service tests
  - **Task**: Create unit tests for the Offramp Service following TDD principles
  - **Files**:
    - `src/modules/offramp/offramp.service.spec.ts`: Test for Offramp Service
    - `src/modules/offramp/docs/modulespec.md`: Offramp module specification
  - **Step Dependencies**: Step E1, Step 4
  - **User Instructions**: None

- [ ] Step E3: Implement Offramp Service
  - **Task**: Implement Offramp Service methods for handling unsettled transactions and initiating settlement via Paycrest
  - **Files**:
    - `src/modules/offramp/offramp.service.ts`: Offramp Service implementation
    - `src/modules/offramp/docs/track-implementation.md`: Implementation tracking
  - **Step Dependencies**: Step E2, Step A3, Step D3
  - **User Instructions**: None

- [ ] Step E4: Create Offramp Controller tests
  - **Task**: Create unit tests for the Offramp Controller following TDD principles
  - **Files**:
    - `src/modules/offramp/offramp.controller.spec.ts`: Test for Offramp Controller
  - **Step Dependencies**: Step E3
  - **User Instructions**: None

- [ ] Step E5: Implement Offramp Controller
  - **Task**: Implement Offramp Controller endpoints for webhook handling from Paycrest
  - **Files**:
    - `src/modules/offramp/offramp.controller.ts`: Offramp Controller implementation
    - `src/modules/offramp/offramp.module.ts`: Offramp Module configuration
  - **Step Dependencies**: Step E4
  - **User Instructions**: None

- [ ] Step E6: Create Offramp scheduling for unsettled transactions
  - **Task**: Implement cron job to periodically check for unsettled transactions
  - **Files**:
    - `src/modules/offramp/offramp.schedule.ts`: Offramp scheduler
    - `src/modules/offramp/offramp.schedule.spec.ts`: Test for offramp scheduler
  - **Step Dependencies**: Step E5
  - **User Instructions**: None

- [ ] Step E7: Create Offramp module integration tests
  - **Task**: Create integration tests for the Offramp module
  - **Files**:
    - `src/modules/offramp/test/e2e/offramp.e2e-spec.ts`: Integration test for Offramp module
  - **Step Dependencies**: Step E6
  - **User Instructions**: None

## Authentication Integration
- [ ] Step F1: Integrate existing Auth module with new modules
  - **Task**: Import and configure the existing Auth module, setup guards for protected routes
  - **Files**:
    - `src/app.module.ts`: Import Auth module
    - `src/modules/business/business.controller.ts`: Apply AuthGuard
    - `src/modules/wallet/wallet.controller.ts`: Apply AuthGuard
    - `src/modules/transaction/transaction.controller.ts`: Apply AuthGuard
    - `src/modules/offramp/offramp.controller.ts`: Apply AuthGuard
  - **Step Dependencies**: Step B5, Step C5, Step D5, Step E5
  - **User Instructions**: None

- [ ] Step F2: Create permissions and role-based access control
  - **Task**: Implement role-based access control for different endpoints
  - **Files**:
    - `src/common/guards/roles.guard.ts`: Roles guard
    - `src/common/decorators/roles.decorator.ts`: Roles decorator
    - `src/common/guards/roles.guard.spec.ts`: Test for roles guard
  - **Step Dependencies**: Step F1
  - **User Instructions**: None

## End-to-End Testing
- [ ] Step G1: Create E2E test for business onboarding flow
  - **Task**: Implement E2E test for the full business onboarding process
  - **Files**:
    - `test/e2e/business-onboarding.e2e-spec.ts`: E2E test for business onboarding
  - **Step Dependencies**: Step F1
  - **User Instructions**: None

- [ ] Step G2: Create E2E test for transaction processing
  - **Task**: Implement E2E test for transaction processing and status tracking
  - **Files**:
    - `test/e2e/transaction-processing.e2e-spec.ts`: E2E test for transaction processing
  - **Step Dependencies**: Step F1
  - **User Instructions**: None

- [ ] Step G3: Create E2E test for offramp processing
  - **Task**: Implement E2E test for offramp processing and settlement
  - **Files**:
    - `test/e2e/offramp-processing.e2e-spec.ts`: E2E test for offramp processing
  - **Step Dependencies**: Step F1
  - **User Instructions**: None

## Smoke Tests and Health Checks
- [ ] Step H1: Implement smoke tests for all controllers
  - **Task**: Add smoke test endpoints to each controller as specified in the requirements
  - **Files**:
    - `src/modules/business/business.controller.ts`: Add smoke test endpoint
    - `src/modules/wallet/wallet.controller.ts`: Add smoke test endpoint
    - `src/modules/transaction/transaction.controller.ts`: Add smoke test endpoint
    - `src/modules/offramp/offramp.controller.ts`: Add smoke test endpoint
  - **Step Dependencies**: Step B5, Step C5, Step D5, Step E5
  - **User Instructions**: None

- [ ] Step H2: Create health check module
  - **Task**: Implement health check endpoints for the application and its dependencies
  - **Files**:
    - `src/health/health.module.ts`: Health module
    - `src/health/health.controller.ts`: Health controller
    - `src/health/health.service.ts`: Health service
    - `src/app.module.ts`: Import health module
  - **Step Dependencies**: Step 2, Step 3
  - **User Instructions**: None

## Documentation
- [ ] Step I1: Generate API documentation with Swagger
  - **Task**: Set up Swagger for API documentation
  - **Files**:
    - `src/main.ts`: Configure Swagger
    - `src/modules/business/business.controller.ts`: Add Swagger annotations
    - `src/modules/wallet/wallet.controller.ts`: Add Swagger annotations
    - `src/modules/transaction/transaction.controller.ts`: Add Swagger annotations
    - `src/modules/offramp/offramp.controller.ts`: Add Swagger annotations
  - **Step Dependencies**: Step B5, Step C5, Step D5, Step E5
  - **User Instructions**: None

- [ ] Step I2: Complete module documentation
  - **Task**: Finalize documentation for all modules
  - **Files**:
    - `src/modules/business/docs/modulespec.md`: Update documentation
    - `src/modules/wallet/docs/modulespec.md`: Update documentation
    - `src/modules/transaction/docs/modulespec.md`: Update documentation
    - `src/modules/offramp/docs/modulespec.md`: Update documentation
    - `README.md`: Project overview and setup instructions
  - **Step Dependencies**: Step B5, Step C5, Step D5, Step E5
  - **User Instructions**: None

# Implementation Approach Summary

This implementation plan follows a modular, test-driven approach to build the Stableflow Platform backend. Here are the key considerations:

1. **Test-Driven Development**: Each component starts with test implementation followed by actual code, ensuring code quality and reliability.

2. **Modular Architecture**: The application is divided into independent modules (Business, Wallet, Transaction, Offramp) with clear responsibilities.

3. **Database Design**: TypeORM entities are defined early to establish the data model, with relationships carefully managed across modules.

4. **External API Integration**: Wrapper services abstract away the complexity of interacting with Paycrest and Blockradar APIs.

5. **Queue Management**: Redis is utilized for transaction queuing, ensuring no transactions are lost in the process.

6. **Error Handling**: Custom exceptions and filters provide consistent error responses across the application.

7. **Security**: Authentication guards protect resources, with role-based permissions for different actions.

8. **Documentation**: Each module includes comprehensive documentation, and API endpoints are documented using Swagger.

The implementation sequence starts with core infrastructure setup, followed by module-by-module implementation, and concludes with integration, testing, and documentation. Each step is designed to be manageable for a code generation AI, focusing on a specific aspect of the application with clear dependencies and objectives.