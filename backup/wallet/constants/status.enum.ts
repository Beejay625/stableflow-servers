export enum TransactionStatus {
  UNSETTLED = "Unsettled",
  PROCESSING = "processing",
  SETTLED = "settled",
  REFUNDED = "refunded",
  EXPIRED = "expired", // Initial state when received from webhook
}

export default TransactionStatus;
