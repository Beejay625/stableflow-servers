# Bank Account Verification API

## Overview

The Bank Account Verification API allows validating Nigerian bank account details without linking them to a business. This is useful for validating user input before proceeding with a bank account linking operation.

## Features

- Verify bank account using either bank code OR bank name (but not both)
- Validate account numbers against the specified bank
- Retrieve account holder's name directly from the bank
- Return minimal information needed for verification

## API Endpoint

### Verify Bank Account

```
POST /api/v1/businesses/verify-bank-account
```

This endpoint validates bank account details without linking them to a business entity.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| bankCode | string | Conditional | Bank code (required if bankName is not provided) |
| bankName | string | Conditional | Bank name (required if bankCode is not provided) |
| accountNumber | string | Yes | Account number to verify |

**Note:** Either `bankCode` or `bankName` must be provided, but not both.

#### Example Request

```
POST /api/v1/businesses/verify-bank-account?bankCode=044&accountNumber=0123456789
```

Or:

```
POST /api/v1/businesses/verify-bank-account?bankName=Access%20Bank&accountNumber=0123456789
```

#### Response

| Field | Type | Description |
|-------|------|-------------|
| bank.name | string | Full name of the bank |
| bank.code | string | Bank code |
| account.number | string | Account number |
| account.name | string | Account holder's name |

#### Example Response

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "bank": {
      "name": "Access Bank",
      "code": "044"
    },
    "account": {
      "number": "0123456789",
      "name": "John Doe"
    }
  }
}
```

#### Error Responses

##### Invalid Bank Code

```json
{
  "statusCode": 400,
  "message": "Invalid bank code: 999999",
  "error": "Bad Request"
}
```

##### Invalid Bank Name

```json
{
  "statusCode": 400,
  "message": "Invalid bank name: Nonexistent Bank",
  "error": "Bad Request"
}
```

##### Failed Account Verification

```json
{
  "statusCode": 400,
  "message": "Account verification failed: Invalid account number",
  "error": "Bad Request"
}
```

## Implementation Details

- The API uses NubaAPI for bank account verification
- Bank name resolution is handled automatically
- Account holder name is fetched directly from the bank
- No information is stored in the database during this process

## Environment Requirements

The following environment variable must be set:

- `NUBAPI_TOKEN`: API token for NubaAPI service

## Usage Examples

### Curl

```bash
curl -X POST "http://localhost:3001/api/v1/businesses/verify-bank-account?bankCode=044&accountNumber=0123456789"
```

### JavaScript

```javascript
const response = await fetch('http://localhost:3001/api/v1/businesses/verify-bank-account?bankName=Access%20Bank&accountNumber=0123456789', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
});

const data = await response.json();
console.log(data);
``` 