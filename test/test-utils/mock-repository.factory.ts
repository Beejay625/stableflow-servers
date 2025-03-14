import { Repository } from 'typeorm';

export type MockType<T> = {
  [P in keyof T]?: jest.Mock<any>;
};

/**
 * Creates a mock repository with common TypeORM repository methods
 * @returns Mock repository with jest functions
 */
export const createMockRepository = <T>(): MockType<Repository<T>> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    execute: jest.fn(),
  })),
}); 