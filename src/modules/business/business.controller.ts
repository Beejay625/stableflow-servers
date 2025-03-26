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
  Delete,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
  UsePipes,
  ValidationPipe
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
import { BusinessDto } from './dto/update-business.dto';
import { LinkBankDto } from './dto/link-bank.dto';
import { SimplifiedBusinessResponseDto, SimplifiedCategoryDto } from './dto/business-response.dto';
import { Business } from './entities/business.entity';
import { BusinessDetail, BusinessListResponse, CategoryListResponse, ExchangeRateResponse } from './interfaces/business.interface';
import { OnboardingStep, AccountType } from './entities/business.entity';
import { JwtAuthGuard } from '../../common/guards';
import { Public } from '../../common/decorators';
import { VerifyBankDto } from './dto/verify-bank.dto';
import { NubapiResponse } from './interfaces';

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
    description: 'Business ID (UUID)', 
    example: 'business-123'
  })
  @ApiResponse({
    status: 200,
    description: 'Business updated successfully',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        message: { type: 'string', example: 'Business updated successfully' },
        data: { $ref: getSchemaPath(SimplifiedBusinessResponseDto) },
        updatedFields: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'List of fields that were updated',
          example: ['name', 'phoneNumber']
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input or validation error',
    schema: {
      $ref: getSchemaPath(ErrorResponseDto)
    }
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    schema: {
      $ref: getSchemaPath(ErrorResponseDto)
    }
  })
  async updateBusiness(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const messages = errors.map(error => {
          if (error.constraints) {
            return Object.values(error.constraints).join(', ');
          }
          return 'Validation failed';
        });
        
        return new BadRequestException(messages);
      }
    })) updateData: BusinessDto
  ) {
    try {
      const ownerId = req.user.id;
      this.logger.debug(`Updating business ${id} for user ${ownerId} with data: ${JSON.stringify(updateData)}`);
      
      // Extra check to ensure we are not accepting both fields
      if (updateData.categoryId && updateData.categoryName) {
        throw new BadRequestException('Cannot provide both categoryId and categoryName. Please choose one.');
      }

      // Call service to update business
      const result = await this.businessService.updateBusiness(id, ownerId, updateData);
      
      // Enhance the response with information about what changed
      if (result.updatedFields?.length > 0) {
        this.logger.debug(`Updated fields for business ${id}: ${result.updatedFields.join(', ')}`);
        result.message = `Business updated successfully. Changed fields: ${result.updatedFields.join(', ')}`;
      } else {
        result.message = 'No changes were made to the business';
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error updating business ${id}: ${error.message}`, error.stack);
      throw error;
    }
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
  @ApiBody({ type: LinkBankDto })
  @ApiResponse({
    status: 200,
    description: 'Bank account linked successfully',
    type: BusinessResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Missing parameters or invalid data',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Account number is required' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
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
  async updateBankAccount(
    @Param('id') id: string,
    @Body(ValidationPipe) bankDto: LinkBankDto,
    @Req() req?: any
  ) {
    // Extract owner ID from request if available
    const ownerId = req?.user?.id;

    // Use the bank resolution logic for consistent handling
    const { bankCode: resolvedBankCode } = await this.resolveBankInfo(
      bankDto.bankCode, 
      bankDto.bankName
    );

    // Update the DTO with the resolved bank code
    const updatedDto = {
      ...bankDto,
      bankCode: resolvedBankCode
    };

    return this.businessService.updateBankAccount(id, updatedDto, ownerId);
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

  /**
   * Resolves bank code/name mapping for verification endpoints
   * @param bankCode Provided bank code if any
   * @param bankName Provided bank name if any
   * @returns Resolved bank code and name
   */
  private async resolveBankInfo(bankCode?: string, bankName?: string): Promise<{ bankCode: string; bankName?: string }> {
    // Validate at least one is provided
    if (!bankCode && !bankName) {
      throw new BadRequestException('Either bank code or bank name must be provided');
    }
    
    // If bankName is provided but bankCode isn't, look up the code
    if (bankName && !bankCode) {
      try {
        const banks = await this.businessService.getNigerianBanks();
        const foundBank = banks.find(bank => bank.name.toLowerCase() === bankName.toLowerCase());
        
        if (!foundBank) {
          throw new BadRequestException(`Bank name "${bankName}" not found in supported banks list`);
        }
        
        return { bankCode: foundBank.code, bankName };
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(`Failed to resolve bank code from name: ${error.message}`);
      }
    }
    
    // If bankCode is provided but we want to get the bank name too
    if (bankCode && !bankName) {
      try {
        const banks = await this.businessService.getNigerianBanks();
        const foundBank = banks.find(bank => bank.code === bankCode);
        
        if (foundBank) {
          bankName = foundBank.name;
          this.logger.debug(`Resolved bank name "${bankName}" from code "${bankCode}"`);
        }
      } catch (error) {
        // We don't need to fail if bank name resolution fails
        this.logger.warn(`Failed to resolve bank name from code: ${error.message}`);
      }
    }
    
    return { bankCode, bankName };
  }

  /**
   * Verify bank account
   */
  @Get('banks/verify')
  @ApiOperation({
    summary: 'Verify bank account',
    description: 'Verify bank account using either bank code or bank name with account number. Cannot provide both bank code and bank name.'
  })
  @ApiQuery({
    name: 'bankCode',
    description: 'Bank code (e.g., "058"). Cannot be used with bankName.',
    required: false,
    example: '058'
  })
  @ApiQuery({
    name: 'bankName',
    description: 'Bank name (e.g., "Access Bank"). Cannot be used with bankCode.',
    required: false,
    example: 'Access Bank'
  })
  @ApiQuery({
    name: 'accountNumber',
    description: 'Account number to verify',
    required: true,
    example: '0123456789'
  })
  @ApiResponse({
    status: 200,
    description: 'Bank account verified successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        message: { type: 'string', example: 'Bank account verified successfully' },
        data: {
          type: 'object',
          properties: {
            account_name: { type: 'string', example: 'JOHN DOE' },
            account_number: { type: 'string', example: '0123456789' },
            bank_code: { type: 'string', example: '058' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Missing parameters or invalid data',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Cannot provide both bank code and bank name. Please choose one.' },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  async verifyBankAccount(@Query(ValidationPipe) verifyDto: VerifyBankDto): Promise<NubapiResponse> {
    this.logger.log(`Verifying bank account with parameters: ${JSON.stringify(verifyDto)}`);
    
    // Explicitly check if both are provided
    if (verifyDto.bankCode && verifyDto.bankName) {
      throw new BadRequestException('Cannot provide both bank code and bank name. Please choose one.');
    }
    
    // Check if neither is provided
    if (!verifyDto.bankCode && !verifyDto.bankName) {
      throw new BadRequestException('Either bank code or bank name must be provided.');
    }
    
    // Use the common bank resolution logic
    const { bankCode: resolvedBankCode } = await this.resolveBankInfo(
      verifyDto.bankCode, 
      verifyDto.bankName
    );
    
    // Now we should have both accountNumber and bankCode
    return this.businessService.verifyBankAccount(verifyDto.accountNumber, resolvedBankCode);
  }
  
  /**
   * Legacy endpoint for bank account verification (redirects to new endpoint)
   * @deprecated Use GET /banks/verify instead
   */
  @Post('verify-bank-account')
  @Public()
  @ApiOperation({
    summary: 'Verify bank account details (Legacy)',
    description: 'DEPRECATED: Use GET /banks/verify instead. Verifies bank account details without linking to a business.'
  })
  @ApiQuery({
    name: 'bankCode',
    description: 'Bank code (e.g., "058")', 
    required: false,
    example: '058'
  })
  @ApiQuery({
    name: 'bankName',
    description: 'Bank name (e.g., "Access Bank")', 
    required: false,
    example: 'Access Bank'
  })
  @ApiQuery({
    name: 'accountNumber',
    description: 'Account number to verify', 
    required: true,
    example: '0123456789'
  })
  @ApiResponse({
    status: 200,
    description: 'Account verification successful',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        message: { type: 'string', example: 'Bank account verified successfully' },
        data: {
          type: 'object',
          properties: {
            account_name: { type: 'string', example: 'JOHN DOE' },
            account_number: { type: 'string', example: '0123456789' },
            bank_code: { type: 'string', example: '058' }
          }
        }
      }
    }
  })
  async legacyVerifyBankAccount(
    @Query('bankCode') bankCode?: string,
    @Query('bankName') bankName?: string,
    @Query('accountNumber') accountNumber?: string
  ): Promise<NubapiResponse> {
    this.logger.log(`Legacy endpoint: Verifying bank account with parameters: bank code: ${bankCode}, bank name: ${bankName}`);
    
    // Explicitly check if both are provided
    if (bankCode && bankName) {
      throw new BadRequestException('Cannot provide both bank code and bank name. Please choose one.');
    }
    
    // Create a DTO for validation
    const verifyDto = new VerifyBankDto();
    verifyDto.bankCode = bankCode;
    verifyDto.bankName = bankName;
    verifyDto.accountNumber = accountNumber;
    
    // Delegate to the new endpoint implementation
    return this.verifyBankAccount(verifyDto);
  }
}