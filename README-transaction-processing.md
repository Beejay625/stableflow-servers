# Transaction Processing System

This document describes the transaction processing system implemented for the Stableflow platform. The system is designed to handle blockchain transaction processing at scale, with built-in concurrency control, error handling, and recovery mechanisms.

## Architecture Overview

The transaction processing system is built using the following components:

1. **Redis Queue** - Uses BullMQ/Bull for reliable job processing
2. **Transaction Entity** - Stores transaction data in the database
3. **Transaction Processor** - Worker that processes transactions from the queue
4. **Transaction Service** - Business logic for handling transactions
5. **Webhook Controller** - Receives webhook notifications from BlockRadar

## Key Features

- **Clustering Support** - Scales across multiple CPU cores
- **Concurrency Control** - Configurable job concurrency limits
- **Error Handling** - Categorizes errors and handles retries appropriately
- **Transaction Tracking** - Separates transactions into different states (pending, failed, review)
- **Manual Review Process** - Failed transactions can be manually reviewed and reprocessed
- **Batch Processing** - Support for processing transactions in batches
- **Admin API** - Endpoints for monitoring and managing transactions

## Configuration

The system can be configured using environment variables:

```
# Enable clustering for multi-core processing
ENABLE_CLUSTERING=true

# Number of concurrent transactions to process
TRANSACTION_CONCURRENCY=10

# Enable automatic retry for failed transactions
RETRY_TRANSACTIONS=true
```

## API Endpoints

### Public Endpoints

- `POST /api/v1/wallet/transaction/webhook/blockradar` - Webhook for receiving BlockRadar transaction notifications

### Protected Endpoints (requires authentication)

- `GET /api/v1/wallet/transactions/stats` - Get transaction statistics
- `GET /api/v1/wallet/transactions/business/:businessId` - Get transactions for a specific business
- `GET /api/v1/wallet/transactions/pending` - Get all pending transactions
- `GET /api/v1/wallet/transactions/failed` - Get all failed transactions
- `GET /api/v1/wallet/transactions/for-review` - Get transactions that need manual review
- `POST /api/v1/wallet/transactions/retry/:transactionId` - Retry a failed transaction
- `POST /api/v1/wallet/transactions/complete/:transactionId` - Manually mark a transaction as completed

## Transaction Flow

1. A webhook notification is received from BlockRadar
2. The transaction ID is added to a Redis SET of pending transactions
3. A job is created in the Bull queue for processing
4. The TransactionProcessor picks up the job and processes it:
   - Fetches transaction details from BlockRadar API
   - Maps the transaction to a business
   - Saves the transaction details in the database
   - Marks the transaction as complete in Redis
5. If errors occur:
   - Transient errors (network, timeouts) are retried
   - Permanent errors are marked for manual review
   - Failed transactions are recorded for debugging

## Error Handling Strategy

The system distinguishes between different types of errors:

- **Transient Errors** - Network issues, timeouts, rate limits
  - These are automatically retried with exponential backoff
- **Permanent Errors** - Invalid transaction data, business mapping failures
  - These are marked for manual review
  - Administrators can fix the underlying issue and requeue

## Scaling Strategies

The transaction processing system can be scaled in several ways:

1. **Vertical Scaling** - Increase the concurrency level for processing more transactions in parallel
2. **Horizontal Scaling** - Run multiple instances of the application across different servers
3. **CPU Scaling** - Use clustering to utilize all available CPU cores on a single server

## Monitoring

The system logs detailed information about transaction processing, including:

- Number of transactions processed
- Processing time
- Error rates
- Queue sizes
- Business-specific transaction metrics

## Recovery Process

If the system crashes, the recovery process is automatic:

1. Pending transactions remain in the Redis SET
2. When the application restarts, the processor can continue processing
3. Failed transactions can be manually requeued via the admin API 