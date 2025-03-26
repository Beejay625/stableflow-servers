# Offramp Processing Architecture

This document describes the updated offramp processing system implemented for the Stableflow platform. The system is designed to handle cryptocurrency offramp transactions efficiently, with improved error handling, recovery mechanisms, and direct processing.

## Architecture Overview

The offramp processing system has evolved from a queue-based architecture to a direct processing model with the following components:

1. **Transaction Entity** - Stores transaction data in the database
2. **Offramp Service** - Core business logic for handling offramp transactions
3. **Prepare Transaction Service** - Prepares transaction data for processing
4. **Webhook Controller** - Receives webhook notifications from payment providers
5. **Scheduled Jobs** - Cron jobs that process transactions based on their state

## Key Architectural Changes

The major architectural changes include:

- **Removal of Redis and Queue Dependencies** - Direct processing without Redis locks or queue workers
- **Database as Single Source of Truth** - All transaction state is stored in the database
- **Scheduled Processing** - Cron jobs replace queue workers for transaction processing
- **Improved Error Handling** - Enhanced error recovery with detailed logging
- **Manual Recovery Tools** - Admin endpoints for checking and recovering transactions

## Transaction Flow

### Offramp Transaction Processing

1. A new transaction is created with status `UNSETTLED`
2. The transaction is directly processed:
   - Token approval is executed on the blockchain
   - An order is created on the gateway contract
   - Transaction is updated with blockchain hash and metadata
3. A scheduled job runs every minute to check for and process unsettled transactions
4. Webhook notifications update the transaction status as it progresses through the payment provider
5. A stalled transaction checker runs periodically to recover transactions that might be stuck

### Error Handling and Recovery

- **Connection Timeouts** - Implemented with timeout promises for database operations
- **Retry Logic** - Exponential backoff for retrying failed operations
- **Transaction Recovery** - Automated recovery of stalled transactions
- **Manual Intervention** - Admin endpoints for checking and recovering specific transactions

## Scheduled Jobs

The system relies on the following scheduled jobs:

```
- Process Unsettled Transactions (@Cron('*/1 * * * *')) - Runs every minute
- Check Stalled Transactions (@Cron('*/5 * * * *')) - Runs every 5 minutes
```

## API Endpoints

### Transaction Processing Endpoints

- `POST /api/v1/offramp/process/:transactionId` - Process a specific offramp transaction
- `GET /api/v1/offramp/check/:transactionId` - Check and attempt recovery for a specific transaction

### Webhook Endpoints

- `POST /api/v1/offramp/webhook` - Receive webhook notifications from payment providers

## Error Recovery Strategies

The system implements several error recovery strategies:

1. **Automatic Retry** - Failed operations are retried with exponential backoff
2. **Stalled Transaction Checker** - Regularly checks for and recovers stalled transactions
3. **Timeout Handling** - Operations have timeouts to prevent hanging processes
4. **Manual Recovery** - Admin endpoints for manual intervention when needed

## Monitoring and Logging

The system includes comprehensive logging to track:

- Transaction state transitions
- Error details with stack traces
- Recovery attempts and outcomes
- Processing times and performance metrics

## Implementation Details

### Transaction States

Transactions can have the following states:

- `UNSETTLED` - Initial state, transaction has been received but not yet processed
- `PROCESSING` - Transaction is being processed by the payment provider
- `SETTLED` - Transaction has been successfully completed
- `FAILED` - Transaction has failed and requires attention
- `REFUNDED` - Transaction has been refunded
- `STALLED` - Transaction is stuck in processing and needs recovery

### Recovery Process

The recovery process focuses on transactions that might be stuck:

1. Identify transactions in `UNSETTLED` state with a blockchain hash that are older than 15 minutes
2. Check the blockchain for confirmation status
3. If confirmed, attempt to retrieve the order ID from the transaction
4. Update the transaction with the relevant data
5. If recovery fails, mark for manual review

## Benefits of the New Architecture

- **Simplified Architecture** - Fewer dependencies and moving parts
- **Improved Reliability** - No reliance on external queuing systems
- **Better Error Handling** - More robust recovery mechanisms
- **Enhanced Visibility** - Detailed logs for troubleshooting
- **Direct Processing** - Reduced latency for transaction processing
- **Easier Maintenance** - Simpler codebase with fewer potential points of failure
