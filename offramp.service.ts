async handleOfframpError(...) {
  await this.transactionRepository.manager.transaction(async manager => {
    await manager.update(Transaction, transactionId, { status: TransactionStatus.FAILED });
    await manager.delete(OfframpAttempt, { transactionId });
  });
} 