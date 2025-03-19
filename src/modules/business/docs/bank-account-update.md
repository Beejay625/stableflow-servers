# Bank Account Integration Updates

## Overview

The bank account integration has been enhanced to provide more flexibility in linking bank accounts to businesses. Users can now specify either a bank code or a bank name when linking an account, and the system will automatically resolve the appropriate information.

## Updates

- Updated `PUT /api/v1/businesses/{id}/bank-account` to accept query parameters instead of request body
- Enhanced validation to accept either bank code or bank name, but not both
- Integrated with NubaAPI for bank account verification
- Added automatic bank name resolution when only code is provided
- Improved account verification processes and error handling
- Settlement currency is fixed to "NGN" for Nigerian operations

## API Details

### Link/Update Bank Account

```
PUT /api/v1/businesses/{id}/bank-account
```

This endpoint allows linking a bank account to a business or updating an existing linked account.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Business ID (UUID) |

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| bankCode | string | Conditional | Bank code (required if bankName is not provided) |
| bankName | string | Conditional | Bank name (required if bankCode is not provided) |
| accountNumber | string | Yes | Account number |
| accountType | string | Yes | Account type (e.g., "SAVINGS", "CURRENT") |

**Notes:** 
- Either `bankCode` or `bankName` must be provided, but not both.
- The account name is automatically fetched from the bank's API during verification and stored in the database.
- Settlement currency is fixed to "NGN" as we currently only operate in Nigeria.

#### Example Request

With bank code:
```
PUT /api/v1/businesses/7dfe2c46-d0de-4b16-b6fa-9ad25cda90af/bank-account?bankCode=044&accountNumber=0123456789&accountType=SAVINGS
```

With bank name:
```
PUT /api/v1/businesses/7dfe2c46-d0de-4b16-b6fa-9ad25cda90af/bank-account?bankName=Access%20Bank&accountNumber=0123456789&accountType=SAVINGS
```

#### Response

Returns the complete business object with the updated bank account information.

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "id": "7dfe2c46-d0de-4b16-b6fa-9ad25cda90af",
    "name": "Business Name",
    "phoneNumber": "+2347012345678",
    "description": "Business description",
    "isVerified": true,
    "onboardingStep": "COMPLETED",
    "bankCode": "044",
    "accountNumber": "0123456789",
    "accountName": "John Doe",
    "accountType": "SAVINGS",
    "categoryId": "dc03a60c-f585-4e26-8abd-df51976b739c",
    "ownerId": "e3dc6448-cf26-414a-ba2c-1cf5a6b507d6",
    "isActive": true,
    "createdAt": "2025-03-16T23:33:44.261Z",
    "updatedAt": "2025-03-17T22:59:13.454Z",
    "category": {
      "id": "dc03a60c-f585-4e26-8abd-df51976b739c",
      "name": "Category Name",
      "description": "Category description",
      "isCustom": false,
      "isActive": true
    }
  }
}
```

## Environment Setup

The following environment variable must be configured for proper operation:

```
NUBAPI_TOKEN=your_nubapi_token_here
```

This token is used for bank account verification through NubaAPI.

## Testing

To test the bank account linking functionality:

1. Obtain a valid business ID from your database
2. Execute one of the following commands:

```bash
# Using bank code
curl -X PUT "http://localhost:3001/api/v1/businesses/7dfe2c46-d0de-4b16-b6fa-9ad25cda90af/bank-account?bankCode=044&accountNumber=0123456789&accountType=SAVINGS" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Using bank name
curl -X PUT "http://localhost:3001/api/v1/businesses/7dfe2c46-d0de-4b16-b6fa-9ad25cda90af/bank-account?bankName=Access%20Bank&accountNumber=0123456789&accountType=SAVINGS" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

# Bank Account Update Endpoint

## Endpoint

```
PUT /api/v1/businesses/{id}/bank-account
```

This endpoint links a bank account to a business or updates an existing bank account. It accepts parameters as query parameters in the URL.

## Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| bankCode | Yes* | Bank code (e.g., "000014" for ACCESS BANK) |
| bankName | Yes* | Bank name (e.g., "ACCESS BANK") |
| accountNumber | Yes | Account number at the bank |
| accountType | Yes | Account type ("SAVINGS" or "CURRENT") |

* Either `bankCode` or `bankName` must be provided, not both.

**Notes:** 
- The account name is automatically fetched from the bank's API during verification and stored in the database.
- Settlement currency is fixed to "NGN" as we currently only operate in Nigeria.

## Examples

### Using Bank Name

```
PUT /api/v1/businesses/12345/bank-account?bankName=ACCESS%20BANK&accountNumber=0123456789&accountType=SAVINGS
```

### Using Bank Code

```
PUT /api/v1/businesses/12345/bank-account?bankCode=000014&accountNumber=0123456789&accountType=SAVINGS
```

## Response

### Success (200 OK)

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "id": "12345",
    "name": "Business Name",
    "phoneNumber": "+2348123456789",
    "isVerified": true,
    "onboardingStep": "COMPLETED",
    "isActive": true,
    "createdAt": "2025-03-17T10:30:00.000Z",
    "updatedAt": "2025-03-17T11:45:00.000Z"
  }
}
```

### Error Responses

#### Invalid Bank Information (400 Bad Request)

```json
{
  "statusCode": 400,
  "message": "Invalid bank code: 999999",
  "error": "Bad Request"
}
```

#### Business Not Found (404 Not Found)

```json
{
  "statusCode": 404,
  "message": "Business with ID business-123 not found",
  "error": "Not Found"
}
```

#### Business Setup Incomplete (400 Bad Request)

```json
{
  "statusCode": 400,
  "message": "Business details must be set up before linking a bank account",
  "error": "Bad Request"
}
```

## Important Notes

1. The account verification is performed through NubaAPI
2. Bank account verification must succeed to complete the operation
3. Either bank code or bank name can be used, the system will resolve the correct bank
4. Account name is automatically fetched from the bank's API
5. All transactions are processed in NGN (Nigerian Naira) as we currently only operate in Nigeria 