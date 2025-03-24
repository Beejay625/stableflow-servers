export enum TransactionStatus {
    UNSETTLED = 'Unsettled' , 
    PENDING = 'pending',
    PROCESSING = 'processing',
    SETTLED = 'settled',
    STALLED = 'stalled',
    FAILED = 'failed',
    REFUNDED = 'refunded',
    EXPIRED = 'expired',     // Initial state when received from webhook
}

export default TransactionStatus;