import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Body, 
  Param, 
  Query, 
  HttpCode, 
  HttpStatus, 
  Req,
  UseGuards,
  Patch,
  UnauthorizedException
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam, 
  ApiQuery, 
  ApiBody,
  getSchemaPath,
  ApiExtraModels,
  ApiBearerAuth,
  ApiProperty
} from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { LinkBankDto } from './dto/link-bank.dto';
import { SimplifiedBusinessResponseDto, SimplifiedCategoryDto } from './dto/business-response.dto';
import { Business } from './entities/business.entity';
import { BusinessDetail, BusinessListResponse, CategoryListResponse, ExchangeRateResponse } from './interfaces/business.interface';
import { OnboardingStep, AccountType } from './entities/business.entity';
import { JwtAuthGuard } from '../../common/guards';
import { Public } from '../../common/decorators';

// Create classes for API documentation
class BusinessResponseDto {
  id: string;
  name: string;
  phoneNumber: string;
  description: string;
  isVerified: boolean;
  onboardingStep: OnboardingStep;
  ownerId: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  settlementCurrency: string;
  categoryId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: CategoryDto;
}

class CategoryDto {
  @ApiProperty({
    description: 'Category ID (UUID)',
    example: 'dc03a60c-f585-4e26-8abd-df51976b739c'
  })
  id: string;

  @ApiProperty({
    description: 'Category name',
    example: 'Agriculture'
  })
  name: string;

  @ApiProperty({
    description: 'Category description',
    example: 'Farming, agriculture, and related services',
    required: false
  })
  description?: string;

  @ApiProperty({
    description: 'Whether this is a custom category created by a user',
    example: false
  })
  isCustom: boolean;

  @ApiProperty({
    description: 'Whether this category is active',
    example: true
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2023-01-01T00:00:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2023-01-01T00:00:00Z'
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Associated businesses (not included in most responses)',
    type: [Object],
    required: false
  })
  businesses?: any[];
}

class BusinessListResponseDto {
  businesses: BusinessResponseDto[];
  total: number;
  page: number;
  limit: number;
}

class CategoryListResponseDto {
  @ApiProperty({
    description: 'List of business categories',
    type: [CategoryDto],
    isArray: true
  })
  categories: CategoryDto[];

  @ApiProperty({
    description: 'Total number of categories',
    example: 15,
    type: Number
  })
  total: number;
}

class CurrencyDto {
  code: string;
  name: string;
  shortName: string;
  decimals: number;
  symbol: string;
  marketRate: string;
}

class InstitutionDto {
  name: string;
  code: string;
  type: string;
}

class ExchangeRateResponseDto {
  rate: string;
  fiatAmount: string;
  token: string;
  fiat: string;
}

class ErrorResponseDto {
  statusCode: number;
  message: string;
  error: string;
}

@ApiTags('Businesses')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@ApiExtraModels(BusinessResponseDto, CategoryDto, BusinessListResponseDto, CategoryListResponseDto, ErrorResponseDto, CurrencyDto, InstitutionDto, ExchangeRateResponseDto)
@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get a business by ID',
    description: 'Returns business details for the specified ID',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    description: 'Business ID',
    required: true
  })
  @ApiResponse({
    status: 200,
    description: 'Business found and returned successfully',
    type: SimplifiedBusinessResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Business not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Authentication required',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized access' },
        error: { type: 'string', example: 'Unauthorized' }
      }
    }
  })
  async getBusinessById(@Param('id') id: string, @Req() req) {
    const ownerId = req.user.id;
    return this.businessService.getBusinessById(id, ownerId);
  }

  /**
   * Updates a business entity by ID (partial update)
   * @param id Business ID
   * @param updateData Updated business data (partial)
   * @param req Request object containing user information
   * @returns Updated business entity
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a business entity',
    description: 'Updates business information like name, description, etc.'
  })
  @ApiParam({ name: 'id', description: 'Business ID', type: 'string' })
  @ApiBody({ type: UpdateBusinessDto })
  @ApiResponse({
    status: 200,
    description: 'Business updated successfully',
    type: SimplifiedBusinessResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'Business not found' },
        error: { type: 'string', example: 'Not Found' }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid input data',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          invalidInput: {
            summary: 'Invalid input data',
            value: {
              statusCode: 400,
              message: 'categoryId must be a valid UUID format (e.g., 123e4567-e89b-12d3-a456-426614174000)',
              error: 'Bad Request'
            }
          }
        }
      }
    }
  })
  async updateBusiness(
    @Param('id') id: string,
    @Body() updateData: UpdateBusinessDto,
    @Req() req
  ) {
    const ownerId = req.user.id;
    return this.businessService.updateBusiness(id, updateData, ownerId);
  }

  @Put(':id/bank-account')
  @ApiOperation({
    summary: 'Link bank account to business',
    description: 'Add or update bank account information for the business'
  })
  @ApiParam({ name: 'id', description: 'Business ID', type: 'string' })
  @ApiBody({ type: LinkBankDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Bank account successfully linked or updated.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(BusinessResponseDto) },
        examples: {
          linkedAccount: {
            summary: 'Business with linked bank account',
            value: {
              id: 'business-123',
              name: 'My Business',
              phoneNumber: '+2347012345678',
              description: 'A small retail business',
              isVerified: false,
              onboardingStep: OnboardingStep.ACCOUNT_SETUP,
              ownerId: 'user-123',
              bankCode: 'GTBINGLA',
              accountNumber: '1234567890',
              accountName: 'John Doe',
              accountType: AccountType.POS,
              settlementCurrency: 'NGN',
              categoryId: '123e4567-e89b-12d3-a456-426614174000',
              isActive: true,
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T12:34:56Z'
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid bank details, verification failed, or business setup not completed.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          invalidBank: {
            summary: 'Invalid bank code error',
            value: {
              statusCode: 400,
              message: 'Invalid bank code for the selected currency',
              error: 'Bad Request'
            }
          },
          businessSetupIncomplete: {
            summary: 'Business setup not completed',
            value: {
              statusCode: 400,
              message: 'Business details must be set up before linking a bank account',
              error: 'Bad Request'
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Business not found.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          businessNotFound: {
            summary: 'Business not found error',
            value: {
              statusCode: 404,
              message: 'Business with ID business-123 not found',
              error: 'Not Found'
            }
          }
        }
      }
    }
  })
  async updateBankAccount(
    @Param('id') id: string,
    @Body() linkBankDto: LinkBankDto,
    @Req() req
  ) {
    const ownerId = req.user.id;
    return this.businessService.updateBankAccount(id, linkBankDto, ownerId);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all businesses',
    description: 'Returns a paginated list of all businesses on the platform (requires authentication)'
  })
  @ApiQuery({ name: 'page', description: 'Page number', type: 'number', required: false })
  @ApiQuery({ name: 'limit', description: 'Items per page', type: 'number', required: false })
  @ApiResponse({
    status: 200,
    description: 'List of businesses retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            businesses: {
              type: 'array',
              items: { $ref: getSchemaPath(SimplifiedBusinessResponseDto) }
            },
            total: { type: 'number', example: 10 },
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 10 }
          }
        }
      }
    }
  })
  async getAllBusinesses(
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.businessService.getAllBusinesses(page, limit);
  }

  @Get('categories/all')
  @Public()
  @ApiOperation({
    summary: 'Get all business categories',
    description: 'Returns a list of all available business categories. Can filter by name if provided.'
  })
  @ApiQuery({ 
    name: 'name', 
    required: false,
    description: 'Filter categories by name (optional)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Return all business categories or a single category if name is provided.',
    type: CategoryListResponseDto,
    content: {
      'application/json': {
        schema: {
          $ref: getSchemaPath(CategoryListResponseDto)
        },
        examples: {
          categoryList: {
            summary: 'List of categories',
            value: {
              categories: [
                {
                  id: 'dc03a60c-f585-4e26-8abd-df51976b739c',
                  name: 'Agriculture',
                  description: 'Farming, agriculture, and related services',
                  isCustom: false,
                  isActive: true
                },
                {
                  id: '04426fb1-3b3f-4b32-8168-6ab89f78a3df',
                  name: 'Beauty & Wellness',
                  description: 'Salons, spas, fitness centers, and wellness services',
                  isCustom: false,
                  isActive: true
                },
                {
                  id: '036df1d1-bf84-4fc3-8dcf-20c61a736150',
                  name: 'Retail',
                  description: 'Physical or online stores selling products directly to consumers',
                  isCustom: false,
                  isActive: true
                }
              ],
              total: 3
            }
          },
          singleCategory: {
            summary: 'Single category when filtering by name',
            value: {
              categories: [
                {
                  id: 'dc03a60c-f585-4e26-8abd-df51976b739c',
                  name: 'Agriculture',
                  description: 'Farming, agriculture, and related services',
                  isCustom: false,
                  isActive: true
                }
              ],
              total: 1
            }
          }
        }
      }
    }
  })
  async getAllCategories(@Query('name') name?: string) {
    const result = await this.businessService.getAllCategories(name);
    
    // Map CategoryDetail[] to CategoryDto[]
    const categoryDtos = result.categories.map(category => ({
      id: category.id,
      name: category.name,
      description: category.description,
      isCustom: category.isCustom,
      isActive: category.isActive
    }));
    
    return {
      categories: categoryDtos,
      total: result.total
    };
  }

  @Post(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a business',
    description: 'Sets a business as inactive but doesn\'t delete it from the database'
  })
  @ApiParam({ name: 'id', description: 'Business ID', type: 'string' })
  @ApiResponse({ 
    status: 200, 
    description: 'Business successfully deactivated.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true }
          }
        },
        examples: {
          success: {
            summary: 'Successful deactivation',
            value: {
              success: true
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Business not found.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          businessNotFound: {
            summary: 'Business not found error',
            value: {
              statusCode: 404,
              message: 'Business with ID business-123 not found',
              error: 'Not Found'
            }
          }
        }
      }
    }
  })
  @HttpCode(HttpStatus.OK)
  async deactivateBusiness(@Param('id') id: string, @Req() req) {
    const ownerId = req.user.id;
    await this.businessService.deactivateBusiness(id, ownerId);
    return { message: 'Business deactivated successfully' };
  }

  @Get('currencies')
  @Public()
  @ApiOperation({
    summary: 'Get supported currencies',
    description: 'Returns a list of all currencies supported by the payment processor'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Return all supported currencies.',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: { $ref: getSchemaPath(CurrencyDto) }
        },
        examples: {
          currencies: {
            summary: 'List of supported currencies',
            value: [
              {
                code: 'NGN',
                name: 'Nigerian Naira',
                shortName: 'Naira',
                decimals: 2,
                symbol: '₦',
                marketRate: '1629.59'
              },
              {
                code: 'USD',
                name: 'US Dollar',
                shortName: 'USD',
                decimals: 2,
                symbol: '$',
                marketRate: '1'
              },
              {
                code: 'KES',
                name: 'Kenyan Shilling',
                shortName: 'KES',
                decimals: 2,
                symbol: 'KSh',
                marketRate: '129.3'
              }
            ]
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Failed to fetch currencies from payment processor.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          apiError: {
            summary: 'API error',
            value: {
              statusCode: 400,
              message: 'Failed to fetch supported currencies: API Error',
              error: 'Bad Request'
            }
          }
        }
      }
    }
  })
  async getSupportedCurrencies() {
    return this.businessService.getSupportedCurrencies();
  }

  @Get('institutions/:currencyCode')
  @Public()
  @ApiOperation({
    summary: 'Get supported financial institutions',
    description: 'Returns a list of supported banks and financial institutions for a currency'
  })
  @ApiParam({ 
    name: 'currencyCode', 
    description: 'Currency code (e.g., NGN, USD)', 
    example: 'NGN',
    schema: {
      type: 'string',
      enum: [
        'NGN', 'GHS', 'USD', 'EUR', 'GBP'
      ]
    }
  })
  async getSupportedInstitutions(@Param('currencyCode') currencyCode: string) {
    return this.businessService.getSupportedInstitutions(currencyCode);
  }

  @Get('exchange-rate/:currencyCode')
  @ApiOperation({ 
    summary: 'Get exchange rate for a currency', 
    description: 'Returns the current exchange rate between a cryptocurrency token and fiat currency.'
  })
  @ApiParam({ 
    name: 'currencyCode', 
    description: 'Currency code (e.g., NGN, USD)',
    type: 'string',
    example: 'NGN'
  })
  @ApiQuery({ 
    name: 'amount', 
    required: false, 
    description: 'Amount to convert (default: "1")',
    example: '100',
    type: String
  })
  @ApiQuery({ 
    name: 'tokenCode', 
    required: false, 
    description: 'Token code (default: "USDT")',
    example: 'USDT',
    type: String
  })
  @ApiQuery({ 
    name: 'providerId', 
    required: false, 
    description: 'Provider ID (optional)',
    example: 'provider-123',
    type: String
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Return exchange rate for the currency.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ExchangeRateResponseDto) },
        examples: {
          exchangeRate: {
            summary: 'Token to fiat exchange rate',
            value: {
              rate: '1629.59',
              fiatAmount: '162959.00',
              token: 'USDT',
              fiat: 'NGN'
            }
          }
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Failed to fetch exchange rate from payment processor.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          apiError: {
            summary: 'API error',
            value: {
              statusCode: 400,
              message: 'Failed to get exchange rate: API Error',
              error: 'Bad Request'
            }
          }
        }
      }
    }
  })
  async getExchangeRate(
    @Param('currencyCode') currencyCode: string,
    @Query('amount') amount: string = "1",
    @Query('tokenCode') tokenCode: string = "USDT",
    @Query('providerId') providerId?: string
  ) {
    return this.businessService.getExchangeRate(
      tokenCode,
      amount,
      currencyCode,
      providerId
    );
  }
}