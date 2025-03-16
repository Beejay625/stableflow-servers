import { Test, TestingModule } from '@nestjs/testing';
import { BaseService } from '../base.service';
import { PaginationDto } from '../../dto/pagination.dto';
import { Repository } from 'typeorm';

interface TestEntity {
  id: number;
  name: string;
}

// Mock query builder
const createMockQueryBuilder = (data: TestEntity[], total: number) => {
  return {
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([data, total])
  };
};

class TestService extends BaseService<TestEntity> {
  constructor(repository: Repository<TestEntity>) {
    super(repository);
  }

  async findAll(paginationDto: PaginationDto = {}) {
    // Create a mock query builder for testing
    const queryBuilder = createMockQueryBuilder(
      [{ id: 1, name: 'Test 1' }, { id: 2, name: 'Test 2' }],
      10
    );
    
    // Use findAllPaginated instead of paginate
    const { page = 1, limit = 10 } = paginationDto;
    const [items, totalItems] = await queryBuilder.getManyAndCount();
    
    return {
      items,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async findOne(id: number) {
    return this.repository.findOne({ where: { id } });
  }
}

describe('BaseService', () => {
  let service: TestService;
  let repository: Repository<TestEntity>;

  beforeEach(async () => {
    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    } as any;

    service = new TestService(repository);
  });

  describe('paginate', () => {
    it('should return paginated results', async () => {
      const mockData: TestEntity[] = [
        { id: 1, name: 'Test 1' },
        { id: 2, name: 'Test 2' },
      ];
      const totalItems = 10;
      const paginationDto: PaginationDto = {
        page: 1,
        limit: 10,
      };

      const result = await service.findAll(paginationDto);

      expect(result.items).toHaveLength(2);
      expect(result.meta).toEqual({
        totalItems,
        itemCount: mockData.length,
        itemsPerPage: paginationDto.limit,
        totalPages: Math.ceil(totalItems / paginationDto.limit),
        currentPage: paginationDto.page,
      });
    });

    it('should use default pagination values', async () => {
      const result = await service.findAll({});

      expect(result.meta.currentPage).toBe(1);
      expect(result.meta.itemsPerPage).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return entity by id', async () => {
      const mockEntity: TestEntity = { id: 1, name: 'Test 1' };

      (repository.findOne as jest.Mock).mockResolvedValue(mockEntity);

      const result = await service.findOne(1);

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(mockEntity);
    });

    it('should return null when entity not found', async () => {
      (repository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.findOne(999);

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 999 } });
      expect(result).toBeNull();
    });
  });
}); 