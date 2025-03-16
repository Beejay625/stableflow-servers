# Business Module Specification

## Overview

The Business module is responsible for managing business entities, categories, and bank account linking in the Stableflow platform. It enables businesses to register, provide their details, and link their bank accounts for receiving fiat settlements of cryptocurrency payments.

## Key Features

1. **Business Registration**: Allows users to register their business with essential details
2. **Category Management**: Supports both predefined and custom business categories
3. **Bank Account Linking**: Enables businesses to link their bank accounts for settlements
4. **Bank Verification**: Integrates with Paycrest API to verify bank account details
5. **Business Management**: Provides CRUD operations for business entities
6. **Two-Step Onboarding**: Tracks business onboarding through a structured two-step process

## API Endpoints

### Business Endpoints

| Method | Endpoint                     | Description                           | Authentication |
|--------|------------------------------|---------------------------------------|----------------|
| POST   | /business                    | Create a new business                 | Required       |
| GET    | /business/:id                | Get business details by ID            | Required       |
| PUT    | /business/:id                | Update business details               | Required       |
| DELETE | /business/:id                | Deactivate a business                 | Required       |
| GET    | /business                    | List businesses (paginated)           | Required       |
| POST   | /business/:id/bank           | Link bank account to business         | Required       |
| GET    | /business/:id/bank           | Get business bank details             | Required       |

### Category Endpoints

| Method | Endpoint                     | Description                           | Authentication |
|--------|------------------------------|---------------------------------------|----------------|
| POST   | /business/categories         | Create a new category                 | Required       |
| GET    | /business/categories/:id     | Get category details by ID            | Required       |
| GET    | /business/categories         | List all categories                   | Required       |

## Data Models

### Business Entity

The Business entity stores information about a registered business and its bank account details:

- id: UUID (Primary Key)
- name: String
- phoneNumber: String (in international format)
- description: String (optional)
- isVerified: Boolean
- onboardingStep: Enum ('NOT_STARTED', 'BUSINESS_SETUP', 'ACCOUNT_SETUP', 'COMPLETED')
- bankCode: String (optional during registration, required for verified businesses)
- accountNumber: String (optional during registration, required for verified businesses)
- accountName: String (optional)
- accountType: Enum ('pos', 'cash')
- settlementCurrency: String (optional, defaults to 'USD')
- categoryId: UUID (Foreign Key to Category)
- ownerId: UUID (Foreign Key to User)
- isActive: Boolean
- createdAt: Date
- updatedAt: Date

### Category Entity

The Category entity represents business categories:

- id: UUID (Primary Key)
- name: String (unique)
- description: String (optional)
- isCustom: Boolean
- isActive: Boolean
- createdAt: Date
- updatedAt: Date

## Business Rules

1. Each business must be associated with a registered user (owner)
2. A business name must be unique within the platform
3. Phone numbers must be validated in international format
4. Business onboarding follows a two-step process:
   - Step 1: Business setup (creates the business entity with basic information)
   - Step 2: Account setup (links bank account details)
5. A business is only verified when both onboarding steps are completed
6. Bank details (bankCode and accountNumber) are required for a business to be verified
7. Account type must be either 'pos' or 'cash'
8. When a custom category is created, it is marked as `isCustom=true`
9. Bank account details should be securely stored and handled
10. Only the business owner can view or modify their business details

## Onboarding Flow

1. **NOT_STARTED**: Initial state, no business information provided yet
2. **BUSINESS_SETUP**: Basic business information has been provided (name, phone, category)
3. **ACCOUNT_SETUP**: Bank account information has been provided but not yet verified
4. **COMPLETED**: All information is provided and verified, business is ready to accept payments

## Integration Points

1. **Auth Module**: Uses authentication to protect business routes and identify owners
2. **Wallet Module**: Triggers wallet address generation when a business is verified
3. **Offramp Module**: Provides bank account details for fiat settlements
4. **Paycrest API**: Verifies bank account details before acceptance

## Error Handling

The module provides consistent error responses for various failure scenarios:

1. Invalid input data (400 Bad Request)
2. Authentication failures (401 Unauthorized)
3. Authorization failures (403 Forbidden)
4. Resource not found (404 Not Found)
5. Bank verification failures (422 Unprocessable Entity)
6. System errors (500 Internal Server Error)

## Security Considerations

1. Bank account details must be properly secured and accessed only by authorized users
2. Input validation must be enforced for all endpoints
3. Business owners should only access their own business data
4. Sensitive bank details should be appropriately masked in responses