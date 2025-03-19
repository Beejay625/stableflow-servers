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
  UnauthorizedException,
  Logger,
  BadRequestException,
  Delete
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
import { VerifyBankDto } from './dto/verify-bank.dto';

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
  private readonly logger = new Logger(BusinessController.name);
  
  constructor(private readonly businessService: BusinessService) {}

  /**
   * Get all Nigerian banks
   */
  @Get('banks')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all Nigerian banks' })
  @ApiResponse({
    status: 200,
    description: 'Returns a list of all Nigerian banks',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Nigerian banks fetched successfully' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Access Bank' },
              code: { type: 'string', example: '044' }
            }
          }
        }
      }
    }
  })
  async getNigerianBanks(): Promise<any> {
    try {
      this.logger.log('Getting Nigerian banks from service');
      const banks = await this.businessService.getNigerianBanks();
      
      // Add debug logging
      this.logger.debug(`Successfully retrieved ${banks.length} banks`);
      
      return {
        statusCode: 200,
        message: 'Nigerian banks fetched successfully',
        data: banks
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Nigerian banks: ${error.message}`, error.stack);
      
      // Let NestJS exception filters handle the exception
      throw error;
    }
  }

  /**
   * Retrieves a business entity by ID
   * @param id Business ID
   * @param req Request object containing user information
   * @returns Business entity
   */
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
   * @param req Request object containing user information
   * @returns Updated business entity
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a business entity',
    description: 'Updates business information like name, etc. using query parameters'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Business ID (required)', 
    type: 'string',
    required: true 
  })
  @ApiQuery({ 
    name: 'name', 
    description: 'Business name', 
    type: 'string',
    required: false 
  })
  @ApiQuery({ 
    name: 'phoneNumber', 
    description: 'Business phone number in international format (e.g., +2347012345678)', 
    type: 'string',
    required: false 
  })
  @ApiQuery({ 
    name: 'categoryId', 
    description: 'ID of an existing category (use either categoryId to select an existing category OR categoryName to create a custom category)', 
    type: 'string',
    required: false 
  })
  @ApiQuery({ 
    name: 'categoryName', 
    description: 'Name for a new custom category (use either categoryId to select an existing category OR categoryName to create a custom category)', 
    type: 'string',
    required: false 
  })
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
    @Req() req,
    @Param('id') id: string,
    @Query('name') name?: string,
    @Query('phoneNumber') phoneNumber?: string,
    @Query('categoryId') categoryId?: string,
    @Query('categoryName') categoryName?: string,
  ) {
    const ownerId = req.user.id;
    this.logger.debug(`Updating business ${id} for user ${ownerId}`);
    
    // Construct the update object from query parameters
    const updateData = new UpdateBusinessDto();
    if (name !== undefined) updateData.name = name;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (categoryName !== undefined) updateData.categoryName = categoryName;
    
    return this.businessService.updateBusiness(id, ownerId, updateData);
  }

  @Put(':id/bank-account')
  @ApiOperation({
    summary: 'Update or link bank account',
    description: 'Updates or links a bank account to a business (requires authentication and business ownership)'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Business ID (UUID)', 
    example: 'business-123'
  })
  @ApiQuery({ 
    name: 'bankCode', 
    description: 'Bank code', 
    required: false,
    example: '057'
  })
  @ApiQuery({ 
    name: 'bankName', 
    description: 'Bank name (used if bankCode is not provided)', 
    required: false,
    example: 'Zenith Bank'
  })
  @ApiQuery({ 
    name: 'accountNumber', 
    description: 'Account number', 
    required: true,
    example: '1234567890'
  })
  @ApiQuery({ 
    name: 'accountType', 
    description: 'Account type', 
    required: true,
    enum: Object.values(AccountType),
    example: 'pos'
  })
  @ApiResponse({
    status: 200,
    description: 'Bank account linked successfully',
    content: {
      'application/json': {
        schema: {
          $ref: getSchemaPath(BusinessResponseDto)
        },
        examples: {
          accountLinked: {
            summary: 'Bank account linked successfully',
            value: {
              statusCode: 200,
              message: 'Success',
              data: {
                // example data
              }
            }
          },
          inactiveBusinessError: {
            summary: 'Business not active error',
            value: {
              statusCode: 400,
              message: 'Business is not active',
              error: 'Bad Request'
            }
          },
          businessNotFoundError: {
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
    @Query('bankName') bankName?: string,
    @Query('bankCode') bankCode?: string,
    @Query('accountNumber') accountNumber?: string,
    @Query('accountType') accountType?: string,
    @Req() req?: any
  ) {
    if (!bankCode && !bankName) {
      throw new BadRequestException('Either bankCode or bankName must be provided');
    }

    if (!accountNumber) {
      throw new BadRequestException('Account number is required');
    }

    if (!accountType) {
      throw new BadRequestException('Account type is required');
    }

    // Convert string accountType to enum value
    let accountTypeEnum: AccountType | undefined;
    
    if (accountType === AccountType.POS || accountType === AccountType.CASH) {
      accountTypeEnum = accountType as AccountType;
    } else {
      throw new BadRequestException(`Invalid account type. Must be one of: ${Object.values(AccountType).join(', ')}`);
    }

    // Extract owner ID from request if available
    const ownerId = req?.user?.id;

    return this.businessService.updateBankAccount(id, {
      bankCode,
      bankName,
      accountNumber,
      accountType: accountTypeEnum,
    }, ownerId);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all businesses',
    description: 'Returns a paginated list of all businesses'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Page number (defaults to 1)' 
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    description: 'Results per page (defaults to 10)' 
  })
  @ApiQuery({ 
    name: 'isVerified', 
    required: false, 
    description: 'Filter by verification status (true for verified, false for unverified)' 
  })
  @ApiResponse({
    status: 200,
    description: 'Returns a paginated list of businesses',
    content: {
      'application/json': {
        schema: {
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
    @Query('limit') limit?: number,
    @Query('isVerified') isVerified?: boolean
  ) {
    return this.businessService.getAllBusinesses(page, limit, isVerified);
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

  @Public()
  @Post('verify-bank-account')
  @ApiOperation({
    summary: 'Verify bank account details without linking to a business',
    description: 'Validates bank account details using either bank code or bank name (not both) along with account number. Returns bank and account information without linking to a business.'
  })
  @ApiQuery({ 
    name: 'bankCode', 
    required: false, 
    description: 'Bank code (required if bankName is not provided)',
    type: String
  })
  @ApiQuery({ 
    name: 'bankName', 
    required: false, 
    description: 'Bank name (required if bankCode is not provided)',
    type: String
  })
  @ApiQuery({ 
    name: 'accountNumber', 
    required: true, 
    description: 'Account number to verify',
    type: String
  })
  @ApiResponse({
    status: 200,
    description: 'Bank account verified successfully',
    content: {
      'application/json': {
        example: {
          statusCode: 200,
          message: 'Success',
          data: {
            bank: {
              name: 'Access Bank',
              code: '044'
            },
            account: {
              number: '0123456789',
              name: 'John Doe'
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid bank information or account details',
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        examples: {
          invalidBank: {
            summary: 'Invalid bank code error',
            value: {
              statusCode: 400,
              message: 'Invalid bank code: 999999',
              error: 'Bad Request'
            }
          },
          invalidBankName: {
            summary: 'Invalid bank name error',
            value: {
              statusCode: 400,
              message: 'Invalid bank name: Nonexistent Bank',
              error: 'Bad Request'
            }
          },
          verificationFailed: {
            summary: 'Account verification failed',
            value: {
              statusCode: 400,
              message: 'Account verification failed: Invalid account number',
              error: 'Bad Request'
            }
          }
        }
      }
    }
  })
  async verifyBankAccount(
    @Query('bankCode') bankCode?: string,
    @Query('bankName') bankName?: string,
    @Query('accountNumber') accountNumber?: string
  ) {
    this.logger.log(`Verifying bank account with ${bankCode ? 'code' : 'name'}`);
    
    if (!accountNumber) {
      throw new BadRequestException('Account number is required');
    }
    
    if (!bankCode && !bankName) {
      throw new BadRequestException('Either bank code or bank name must be provided');
    }
    
    // Create a DTO-like object to pass to the service
    const verifyData: VerifyBankDto = {
      bankCode,
      bankName,
      accountNumber
    };
    
    return this.businessService.verifyBankAccount(verifyData);
  }
}