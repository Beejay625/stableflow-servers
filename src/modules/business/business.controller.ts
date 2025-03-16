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
  Patch
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam, 
  ApiQuery, 
  ApiBody,
  getSchemaPath,
  ApiExtraModels
} from '@nestjs/swagger';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { LinkBankDto } from './dto/link-bank.dto';
import { Business } from './entities/business.entity';
import { BusinessDetail, BusinessListResponse, CategoryListResponse, ExchangeRateResponse } from './interfaces/business.interface';
import { OnboardingStep, AccountType } from './entities/business.entity';

// Create classes for API documentation
class BusinessResponseDto implements Partial<Business> {
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
  isCustom: boolean;
  isActive: boolean;
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

@ApiTags('businesses')
@ApiExtraModels(
  BusinessResponseDto, 
  CategoryDto, 
  BusinessListResponseDto, 
  CategoryListResponseDto, 
  CurrencyDto,
  InstitutionDto,
  ExchangeRateResponseDto,
  ErrorResponseDto
)
@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get a business by ID', 
    description: 'Retrieves complete business information by ID for the authenticated user. Returns all details about the business including bank account info, verification status, etc.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Business ID',
    type: 'string',
    example: 'business-123'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Return the business with complete details.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(BusinessResponseDto) },
        examples: {
          businessExample: {
            summary: 'A business with complete details',
            value: {
              id: 'business-123',
              name: 'My Business',
              phoneNumber: '+2347012345678',
              description: 'A small retail business',
              isVerified: false,
              onboardingStep: OnboardingStep.BUSINESS_SETUP,
              ownerId: 'user-123',
              bankCode: null,
              accountNumber: null,
              accountName: null,
              accountType: null,
              settlementCurrency: 'USD',
              categoryId: 'category-123',
              isActive: true,
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z',
              category: {
                id: 'category-123',
                name: 'Retail',
                isCustom: false,
                isActive: true
              }
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
  async getBusinessById(@Param('id') id: string, @Req() req) {
    const ownerId = req.user?.id || 'default-owner-id';
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
    summary: 'Update business entity',
    description: 'Updates a business entity with new or modified information.  All fields are initially null and updating them advances the onboarding process.'
  })
  @ApiParam({
    name: 'id',
    description: 'Business ID',
    type: String,
    example: 'business-123'
  })
  @ApiBody({
    type: CreateBusinessDto,
    description: 'Business entity data to update',
    examples: {
      'Update with existing category': {
        value: {
          name: 'My Business',
          phoneNumber: '+2347012345678',
          description: 'A small retail business',
          categoryId: 'category-123'
        }
      },
      'Update with new category': {
        value: {
          name: 'My Restaurant',
          phoneNumber: '+2347012345678',
          description: 'A restaurant business',
          categoryName: 'Food & Beverage'
        }
      },
      'Partial update': {
        value: {
          name: 'Updated Business Name'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Business entity updated successfully',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(BusinessResponseDto) },
        example: {
          id: 'business-123',
          name: 'My Business',
          phoneNumber: '+2347012345678',
          description: 'A small retail business',
          isVerified: false,
          onboardingStep: OnboardingStep.BUSINESS_SETUP,
          ownerId: 'user-123',
          bankCode: null,
          accountNumber: null,
          accountName: null,
          accountType: null,
          settlementCurrency: 'USD',
          categoryId: 'category-123',
          isActive: true,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T12:34:56Z'
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data provided or missing required fields',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          missingCategory: {
            summary: 'Missing category error',
            value: {
              statusCode: 400,
              message: 'Either categoryId or categoryName must be provided',
              error: 'Bad Request'
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 404,
    description: 'Business or category not found',
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
          },
          categoryNotFound: {
            summary: 'Category not found error',
            value: {
              statusCode: 404,
              message: 'Category with ID category-123 not found',
              error: 'Not Found'
            }
          }
        }
      }
    }
  })
  async updateBusinessEntity(
    @Param('id') id: string,
    @Body() updateData: CreateBusinessDto,
    @Req() req: any
  ): Promise<Business> {
    const ownerId = req.user?.id || 'default-owner-id';
    return this.businessService.updateBusinessEntity(id, updateData, ownerId);
  }

  @Put(':id/bank-account')
  @ApiOperation({ 
    summary: 'Link or update bank account', 
    description: 'Links a bank account to a business or updates existing bank details. This endpoint handles both the initial setup and any subsequent updates. Bank account details are validated through the Paycrest API, and successful linking advances the onboarding process.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Business ID',
    type: 'string',
    example: 'business-123'
  })
  @ApiBody({
    description: 'Bank account details',
    type: LinkBankDto,
    examples: {
      example1: {
        summary: 'Link Nigerian bank account',
        value: {
          bankCode: 'GTBINGLA',
          accountNumber: '1234567890',
          accountName: 'John Doe',
          accountType: AccountType.POS,
          settlementCurrency: 'NGN'
        }
      },
      example2: {
        summary: 'Link account with auto-name retrieval',
        value: {
          bankCode: 'FBNINGLA',
          accountNumber: '0987654321',
          accountType: AccountType.POS,
          settlementCurrency: 'NGN'
        }
      }
    }
  })
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
    @Req() req,
  ) {
    const ownerId = req.user?.id || 'default-owner-id';
    return this.businessService.updateBankAccount(id, linkBankDto, ownerId);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get all businesses', 
    description: 'Returns a paginated list of all businesses owned by the authenticated user.'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Page number (1-indexed)',
    example: 1,
    type: Number
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    description: 'Items per page',
    example: 10,
    type: Number
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Return all businesses.',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(BusinessListResponseDto) },
        examples: {
          businessList: {
            summary: 'List of businesses',
            value: {
              businesses: [
                {
                  id: 'business-123',
                  name: 'My Business',
                  phoneNumber: '+2347012345678',
                  description: 'A small retail business',
                  isVerified: false,
                  onboardingStep: OnboardingStep.BUSINESS_SETUP,
                  ownerId: 'user-123',
                  bankCode: null,
                  accountNumber: null,
                  accountName: null,
                  accountType: null,
                  settlementCurrency: 'USD',
                  categoryId: 'category-123',
                  isActive: true,
                  createdAt: '2023-01-01T00:00:00Z',
                  updatedAt: '2023-01-01T00:00:00Z',
                  category: {
                    id: 'category-123',
                    name: 'Retail'
                  }
                },
                {
                  id: 'business-456',
                  name: 'My Restaurant',
                  phoneNumber: '+2347098765432',
                  description: 'A restaurant business',
                  isVerified: true,
                  onboardingStep: OnboardingStep.COMPLETED,
                  ownerId: 'user-123',
                  bankCode: 'GTBINGLA',
                  accountNumber: '9876543210',
                  accountName: 'John Doe Restaurant',
                  accountType: AccountType.POS,
                  settlementCurrency: 'NGN',
                  categoryId: 'category-456',
                  isActive: true,
                  createdAt: '2023-01-02T00:00:00Z',
                  updatedAt: '2023-01-02T00:00:00Z',
                  category: {
                    id: 'category-456',
                    name: 'Food & Beverage'
                  }
                }
              ],
              total: 2,
              page: 1,
              limit: 10
            }
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
    const ownerId = req.user?.id || 'default-owner-id';
    return this.businessService.getAllBusinesses(ownerId, page, limit);
  }

  @Get('categories/all')
  @ApiOperation({ 
    summary: 'Get all business categories', 
    description: 'Returns a list of all available business categories.'
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
    description: 'Marks a business as inactive (soft delete). The business will no longer be visible in listings.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Business ID',
    type: 'string',
    example: 'business-123'
  })
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
    const ownerId = req.user?.id || 'default-owner-id';
    return this.businessService.deactivateBusiness(id, ownerId);
  }

  @Get('currencies')
  @ApiOperation({ 
    summary: 'Get supported currencies', 
    description: 'Returns all currencies supported by the payment processor for business operations.'
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
  @ApiOperation({ 
    summary: 'Get supported institutions for a currency', 
    description: 'Returns a list of supported financial institutions for the specified currency.'
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
    // The currencyCode param is kept for API compatibility but ignored in the service call
    // as the service now returns all institutions
    return this.businessService.getSupportedInstitutions();
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