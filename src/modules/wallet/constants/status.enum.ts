/**
 * Transaction status enum
 * Represents the different states a transaction can be in
 */
export enum TransactionStatus {
  UNSETTLED = "UNSETTLED", // Transaction received but not processed
  PROCESSING = "PROCESSING", // Transaction is being processed
  SETTLED = "SETTLED", // Transaction successfully processed and settled
  FAILED = "FAILED", // Transaction processing failed
  REFUNDED = "REFUNDED", // Transaction was refunded
} 