# Paycrest API Integration Documentation

## Overview

The Business module integrates with the Paycrest API for bank account verification, currency selection, and financial institution selection. This integration enables a streamlined onboarding process for businesses, allowing users to:

1. Select from supported currencies
2. Select a financial institution based on their chosen currency
3. Verify bank account details before completing the business registration

## API Endpoints

### 1. Fetch Supported Currencies

**Endpoint:** `/v1/currencies`  
**Method:** GET  
**Purpose:** Retrieve a list of all supported currencies with their exchange rates

**Response Format:**
```json
{
  "message": "OK",
  "status": "success",
  "data": [
    {
      "code": "XOF-BEN",
      "name": "West African CFA franc",
      "shortName": "Céfa Benin",
      "decimals": 2,
      "symbol": "CFA",
      "marketRate": "599.5"
    },
    {
      "code": "NGN",
      "name": "Nigerian Naira",
      "shortName": "Naira",
      "decimals": 2,
      "symbol": "₦",
      "marketRate": "1629.59"
    },
    {
      "code": "KES",
      "name": "Kenyan Shilling",
      "shortName": "KES",
      "decimals": 2,
      "symbol": "KSh",
      "marketRate": "129.3"
    }
  ]
}
```

### 2. Fetch Supported Institutions

**Endpoint:** `/v1/institutions/:currency_code`  
**Method:** GET  
**Purpose:** Retrieve a list of supported financial institutions for a specific currency

**Response Format:**
```json
{
  "message": "OK",
  "status": "success",
  "data": [
    {
      "name": "GT Bank Plc",
      "code": "GTBINGLA",
      "type": "bank"
    },
    {
      "name": "First Bank of Nigeria",
      "code": "FBNINGLA",
      "type": "bank"
    }
  ]
}
```

### 3. Verify Account

**Endpoint:** `/v1/verify-account`  
**Method:** POST  
**Purpose:** Verify bank account details and retrieve account holder's name

**Request Payload:**
```json
{
  "institution": "FBNINGLA", 
  "accountIdentifier": "123456789"
}
```

**Field Description:**
- `institution`: The code of the financial institution (required)
- `accountIdentifier`: The bank account number (required)

**Response Format:**
```json
{
  "message": "Account name was fetched successfully",
  "status": "success",
  "data": "John Doe"
}
```

**Note:** If the payment service provider doesn't support name resolution, the `data` field will contain "OK" instead of the account holder's name.

## Integration Flow

The Paycrest API integration follows this flow:

1. **Currency Selection:**
   - The application calls `GET /v1/currencies` to fetch all supported currencies
   - The user selects a currency from the list

2. **Institution Selection:**
   - The application calls `GET /v1/institutions/{selected_currency_code}` to fetch supported institutions
   - The user selects their financial institution

3. **Account Verification:**
   - The user enters their account number
   - The application calls `POST /v1/verify-account` with the selected institution code and account number
   - If successful, the account holder's name is retrieved and displayed
   - The retrieved account holder's name is used to populate the account name field

## Implementation in BusinessService

The BusinessService implements the following methods to interact with the Paycrest API:

1. `getSupportedCurrencies()`: Retrieves all supported currencies
2. `getSupportedInstitutions(currencyCode)`: Retrieves institutions for a specific currency
3. `linkBankAccount(id, linkBankDto, ownerId)`: Verifies bank account details using the Paycrest API

## Error Handling

The integration includes comprehensive error handling:

- API request failures are logged with detailed error messages
- Appropriate exceptions are thrown with user-friendly error messages
- Account verification errors are properly communicated to the user

## Future Enhancements

Planned enhancements for the Paycrest API integration:

1. Adding response caching for currencies and institutions to reduce API calls
2. Implementing webhooks for real-time account verification status updates
3. Adding support for mobile money providers in addition to banks
4. Implementing retry logic for failed API calls 