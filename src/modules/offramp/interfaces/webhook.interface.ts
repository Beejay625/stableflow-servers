export enum WebhookEventType {
  PENDING = 'payment_order.pending',
  SETTLED = 'payment_order.settled',
  EXPIRED = 'payment_order.expired',
  REFUNDED = 'payment_order.refunded',
}

export interface WebhookPayload {
  event: WebhookEventType;
  data: {
    id: string;
    amount?: string;
    amountPaid?: string;
    amountReturned?: string;
    percentSettled?: string;
    rate?: string;
    reference?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    txHash?: string;
    reason?: string;
  };
} 