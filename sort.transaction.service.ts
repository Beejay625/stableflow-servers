// Wrap in transaction
await this.transactionRepository.manager.transaction(
  async transactionalEntityManager => {
    await transactionalEntityManager.save(transaction);
    await transactionalEntityManager.update(Business, businessId, {...});
  }
); 