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
  ApiBearerAuth
} from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
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
  id: string;
  name: string;
  description?: string;
  isCustom: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  businesses?: any[];
}

class BusinessListResponseDto {
  businesses: BusinessResponseDto[];
  total: number;
  page: number;
  limit: number;
}

class CategoryListResponseDto {
  categories: CategoryDto[];
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
  @ApiBody({ type: CreateBusinessDto })
  async updateBusiness(
    @Param('id') id: string,
    @Body() updateData: Partial<Business>,
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
              categoryId: 'category-123',
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
    summary: 'Get all businesses for the authenticated user',
    description: 'Returns a paginated list of all businesses owned by the authenticated user'
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
    @Req() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    const ownerId = req.user.id;
    return this.businessService.getAllBusinesses(ownerId, page, limit);
  }

  @Get('categories/all')
  @Public()
  @ApiOperation({
    summary: 'Get all business categories',
    description: 'Returns a list of all available business categories'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Return all business categories.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(CategoryListResponseDto) },
        examples: {
          categoryList: {
            summary: 'List of categories',
            value: {
              categories: [
                {
                  id: 'category-123',
                  name: 'Retail',
                  isCustom: false,
                  isActive: true
                },
                {
                  id: 'category-456',
                  name: 'Food & Beverage',
                  isCustom: false,
                  isActive: true
                },
                {
                  id: 'category-789',
                  name: 'Technology',
                  isCustom: false,
                  isActive: true
                }
              ],
              total: 3
            }
          }
        }
      }
    }
  })
  async getAllCategories() {
    return this.businessService.getAllCategories();
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