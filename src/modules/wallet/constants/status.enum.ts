export enum TransactionStatus {
    UNSETTLED = 'Unsettled',       // Initial state when received from webhook
    PROCESSING = 'Processing',     // When transaction is being processed
    COMPLETED = 'Completed',       // Final successful state
    FAILED = 'Failed',             // Permanent failure
    STALLED = 'Stalled'            // Long-running processing
}
// •	UNSETTLED → New transaction added, but not sent to Paycrest yet.
// •	SENT → Sent to Paycrest and , but no event ID yet.
// •	PROCESSING → Paycrest responded with an event ID.
// •	COMPLETED → Paycrest confirmed settlement.
// •	FAILED → The transaction failed at our system before reaching Paycrest.
// •	STALLED → Paycrest did not respond in time, requiring manual check.

export default TransactionStatus;