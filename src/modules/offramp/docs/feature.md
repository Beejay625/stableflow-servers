# Offramp Module Features

## Core Features

### Fiat Settlement Processing
- **Cryptocurrency to Fiat Conversion**
  - Convert cryptocurrency payments to fiat currency (USD)
  - Process settlements to business bank accounts
  - Maintain transaction status from "Unsettled" to "Completed"
  - Link settlements with original blockchain transactions
  
- **Payment Order Management**
  - Generate payment orders for Paycrest API
  - Include complete transaction details and bank information
  - Track Paycrest order IDs for verification
  - Monitor settlement status through completion

### Bank Account Integration
- **Account Verification**
  - Verify bank account details via Paycrest API
  - Support different bank codes and account types
  - Ensure valid bank information before settlement
  - Process verification failures appropriately

### Settlement Verification
- **Status Monitoring**
  - Check transaction status in "Processing" state
  - Verify settlement completion with Paycrest API
  - Track time elapsed for processing transactions
  - Alert administrators for delayed settlements
  
- **Settlement Guarantee**
  - Ensure every transaction eventually settles
  - Implement robust verification and monitoring
  - Handle order status changes appropriately

## Scheduled Operations

- **Unsettled Transaction Processing**
  - Run scheduled job every 5 minutes
  - Check for "Unsettled" transactions
  - Initiate fiat settlement process for pending transactions
  - Update transaction status to "Processing"

- **Settlement Verification**
  - Run scheduled job periodically (hourly)
  - Check transactions in "Processing" state
  - Verify settlement status with Paycrest
  - Update transaction status to "Completed" when settled

## API Endpoints

- **POST /offramp/webhook**
  - Handle callbacks from Paycrest API
  - Update settlement status based on webhook data
  - Provide acknowledgment response

## Future Improvements

- **Multi-provider Support**
  - Add support for additional payment processors
  - Implement provider-agnostic settlement interface
  - Support automatic provider selection based on criteria

- **Enhanced Reporting**
  - Provide detailed settlement analytics
  - Implement settlement reconciliation reports
  - Support export of settlement data

- **Settlement Optimization**
  - Implement batch settlement for cost efficiency
  - Add support for scheduled settlements
  - Optimize settlement timing for better rates 