import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PaginatedResponse, PaginationOptions } from '../interfaces/pagination.interface';

@Injectable()
export abstract class BaseService<T> {
  constructor(protected readonly repository: Repository<T>) {}

  /**
   * Get a paginated list of entities
   * @param options Pagination options
   * @returns Paginated response
   */
  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<PaginatedResponse<T>> {
    const { page = 1, limit = 10, sortBy, sortOrder = 'DESC' } = options;
    
    const skip = (page - 1) * limit;
    
    const [items, totalItems] = await this.repository.findAndCount({
      skip,
      take: limit,
      order: sortBy ? { [sortBy]: sortOrder } as any : undefined,
    });

    const totalPages = Math.ceil(totalItems / limit);

    return {
      items,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }
} 