const multi = client.multi();
multi.srem(this.REDIS_SET_KEY, transactionId);
multi.sadd(this.REDIS_COMPLETED_SET, transactionId);
await multi.exec(); 

private readonly REDIS_FAILED_SET = 'failed_transactions'; 

async completeTransaction(transactionId: string) {
  const client = this.redisService.getClient();
  const transactionKey = `transaction:${transactionId}`;
  
  await client.multi()
    .hset(transactionKey, 'status', 'completed')
    .srem('pending', transactionId)
    .sadd('completed', transactionId)
    .exec();
} 