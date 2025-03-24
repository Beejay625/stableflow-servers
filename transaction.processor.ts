// Add rehydration logic
const redisClient = this.redisService.getClient();
const pending = await redisClient.smembers(this.REDIS_SET_KEY);
const processing = await this.transactionRepository.find({
  where: { status: TransactionStatus.PROCESSING }
});

// Reconcile differences 

@Process()
async processTransaction(job: Job) {
  const lock = await redlock.acquire([`lock:${job.id}`], 5000);
  try {
    // Processing logic
  } finally {
    await lock.release();
  }
} 