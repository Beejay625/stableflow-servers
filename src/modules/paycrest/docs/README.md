# Paycrest Module

## Overview

The Paycrest module provides a standalone, reusable integration with the Paycrest API for various payment-related operations across the StableFlow platform.

## Features

- **Bank Account Verification**: Verify bank accounts and retrieve account holder names
- **Currency Management**: Fetch supported currencies with exchange rates
- **Institution Selection**: Get lists of financial institutions for specific currencies
- **Offramp Processing**: Initiate and track cryptocurrency to fiat conversion transactions
- **Webhook Processing**: Handle real-time updates from Paycrest
- **Built-in Caching**: Optional caching mechanism to reduce API calls

## Installation

The Paycrest module is installed as part of the StableFlow backend. It can be included in any module that requires payment integration.

## Usage

### Module Registration

```typescript
import { Module } from '@nestjs/common';
import { PaycrestModule } from '../paycrest/paycrest.module';
import { YourService } from './your.service';

@Module({
  imports: [
    PaycrestModule.register({
      baseUrl: 'https://api.paycrest.com/v1',
      apiKey: 'your-api-key',
      enableCaching: true,
      cacheTtl: 300, // 5 minutes
    }),
  ],
  providers: [YourService],
})
export class YourModule {}
```

### Dependency Injection

```typescript
import { Injectable } from '@nestjs/common';
import { PaycrestService } from '../paycrest/paycrest.service';
import { VerifyAccountRequest } from '../paycrest/interfaces';

@Injectable()
export class YourService {
  constructor(private readonly paycrestService: PaycrestService) {}

  async verifyBankAccount(bankCode: string, accountNumber: string): Promise<string> {
    const request: VerifyAccountRequest = {
      institution: bankCode,
      accountIdentifier: accountNumber,
    };

    const response = await this.paycrestService.verifyAccount(request);
    
    // If account name wasn't found, response.data will be "OK"
    return response.data !== 'OK' ? response.data : null;
  }
}
```

## API Reference

### PaycrestService

#### `verifyAccount(request: VerifyAccountRequest): Promise<PaycrestResponse<string>>`

Verifies a bank account and retrieves the account holder's name.

#### `getSupportedInstitutions(currencyCode: string): Promise<PaycrestResponse<Institution[]>>`

Gets a list of supported financial institutions for a specific currency.

#### `getSupportedCurrencies(): Promise<PaycrestResponse<Currency[]>>`

Gets a list of all supported currencies with their exchange rates.

#### `initiateOfframp(request: OfframpRequest): Promise<PaycrestResponse<OfframpResponse>>`

Initiates an offramp transaction to convert cryptocurrency to fiat.

#### `getOfframpStatus(orderId: string): Promise<PaycrestResponse<OfframpResponse>>`

Checks the status of an existing offramp transaction.

#### `processWebhook(webhookData: WebhookResponse): WebhookResponse`

Processes webhook data received from Paycrest.

## Interfaces

### PaycrestResponse<T>

```typescript
interface PaycrestResponse<T> {
  message: string;
  status: 'success' | 'error';
  data: T;
}
```

### VerifyAccountRequest

```typescript
interface VerifyAccountRequest {
  institution: string;
  accountIdentifier: string;
}
```

### Institution

```typescript
interface Institution {
  name: string;
  code: string;
  type: 'bank' | 'mobile_money';
}
```

### Currency

```typescript
interface Currency {
  code: string;
  name: string;
  shortName: string;
  decimals: number;
  symbol: string;
  marketRate: string;
}
```

## Configuration

The Paycrest module can be configured with these options:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| baseUrl | string | Yes | The base URL for the Paycrest API |
| apiKey | string | Yes | The API key for authentication |
| enableCaching | boolean | No | Whether to enable response caching |
| cacheTtl | number | No | Cache time-to-live in seconds (default: 300) 