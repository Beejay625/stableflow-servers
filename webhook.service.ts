const idempotencyKey = `${transactionId}-${Date.now()}`;
await client.set(`idempotency:${idempotencyKey}`, 'processing', 'EX', 3600); 