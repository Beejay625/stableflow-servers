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
   * 🏦 Get Nigerian Banks
   * 
   * Returns a list of supported Nigerian banks for account verification and linking.
   * Use this endpoint when setting up business bank accounts or verifying bank details.
   * 
   * @endpoint GET /businesses/banks
   * @auth Required
   * 
   * @returns {Object} Bank List Response
   * ```typescript
   * {
   *   statusCode: 200,
   *   message: string,
   *   data: Array<{
   *     name: string,     // e.g., "Access Bank"
   *     code: string,     // e.g., "044"
   *     type?: string,    // e.g., "commercial"
   *     category?: string // e.g., "tier-1"
   *   }>
   * }
   * ```
   * 
   * @example
   * ```typescript
   * const response = await api.get('/businesses/banks');
   * const banks = response.data.data;
   * // Use banks in a dropdown:
   * const bankOptions = banks.map(bank => ({
   *   label: bank.name,
   *   value: bank.code
   * }));
   * ```
   * 
   * @error 401 Unauthorized - Invalid or missing token
   * @error 500 Internal Server Error - Failed to fetch banks
   */
  @Get('banks')
  @ApiBearerAuth('access-token')
  @ApiOperation({ 
    summary: 'Get Nigerian Banks List',
    description: 'Returns a list of supported Nigerian banks for account verification and linking.'
  })
  @ApiResponse({
    status: 200,
    description: 'Banks retrieved successfully',
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
              code: { type: 'string', example: '044' },
              type: { type: 'string', example: 'commercial', nullable: true },
              category: { type: 'string', example: 'tier-1', nullable: true }
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error while fetching banks',
    type: ErrorResponseDto
  })
  async getNigerianBanks(): Promise<any> {
    try {
      this.logger.log('Getting Nigerian banks from service');
      const banks = await this.businessService.getNigerianBanks();
      
      this.logger.debug(`Successfully retrieved ${banks.length} banks`);
      
      return {
        statusCode: 200,
        message: 'Nigerian banks fetched successfully',
        data: banks
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Nigerian banks: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 🏢 Get Business Details
   * 
   * Retrieves comprehensive details of a business by its ID. This endpoint may trigger
   * automatic wallet generation if conditions are met.
   * 
   * @endpoint GET /businesses/:id
   * @auth Required
   * 
   * @param {string} id - Business UUID
   * 
   * @returns {BusinessResponseDto} Business Details
   * ```typescript
   * {
   *   id: string,
   *   name: string,
   *   phoneNumber: string,
   *   isVerified: boolean,
   *   onboardingStep: 'NOT_STARTED' | 'BUSINESS_SETUP' | 'ACCOUNT_SETUP' | 'APPROVED',
   *   walletAddress?: string,
   *   bankDetails?: {
   *     bankName: string,
   *     accountNumber: string,
   *     accountName: string
   *   },
   *   category?: {
   *     id: string,
   *     name: string
   *   },
   *   isActive: boolean,
   *   createdAt: string,
   *   updatedAt: string
   * }
   * ```
   * 
   * @example
   * ```typescript
   * // Fetch business details
   * const business = await api.get(`/businesses/${businessId}`);
   * 
   * // Check if business is fully approved
   * if (business.onboardingStep === 'APPROVED' && business.walletAddress) {
   *   // Business is ready for transactions
   * }
   * 
   * // Handle pending wallet
   * if (business.onboardingStep === 'APPROVED' && !business.walletAddress) {
   *   // Wallet is being generated, poll again in a few seconds
   *   setTimeout(() => refetchBusiness(), 5000);
   * }
   * ```
   * 
   * @error 401 Unauthorized - Invalid or missing token
   * @error 403 Forbidden - User not authorized to access this business
   * @error 404 Not Found - Business doesn't exist
   */
  @Get(':id')
  @ApiOperation({ 
    summary: 'Get Business Details',
    description: 'Retrieves business details and may trigger wallet generation if conditions are met.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Business UUID',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({
    status: 200,
    description: 'Business details retrieved successfully',
    schema: { $ref: getSchemaPath(BusinessResponseDto) }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User not authorized to access this business',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    type: ErrorResponseDto
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

  /**
   * 🔍 Verify Bank Account
   * 
   * Validates bank account details before linking them to a business. Use this endpoint
   * to verify account numbers and get account holder names.
   * 
   * @endpoint GET /businesses/banks/verify
   * @auth Required
   * 
   * @query {string} accountNumber - Account number to verify
   * @query {string} [bankCode] - Bank code (mutually exclusive with bankName)
   * @query {string} [bankName] - Bank name (mutually exclusive with bankCode)
   * 
   * @returns {Object} Verification Result
   * ```typescript
   * {
   *   status: 'success' | 'error',
   *   message: string,
   *   data: {
   *     account_name: string,    // Account holder's name
   *     account_number: string,  // Verified account number
   *     bank_code: string,      // Bank code
   *     bank_name: string       // Bank name
   *   }
   * }
   * ```
   * 
   * @example
   * ```typescript
   * // Using bank code
   * const verify1 = await api.get('/businesses/banks/verify', {
   *   params: {
   *     accountNumber: '0123456789',
   *     bankCode: '044'
   *   }
   * });
   * 
   * // Using bank name
   * const verify2 = await api.get('/businesses/banks/verify', {
   *   params: {
   *     accountNumber: '0123456789',
   *     bankName: 'Access Bank'
   *   }
   * });
   * 
   * // Use the verified details
   * if (verify1.status === 'success') {
   *   const { account_name, account_number } = verify1.data;
   *   // Proceed to link account
   * }
   * ```
   * 
   * @error 400 Bad Request - Invalid parameters or verification failed
   * @error 401 Unauthorized - Invalid or missing token
   * @error 408 Request Timeout - Bank verification service timeout
   */
  @Get('banks/verify')
  @ApiOperation({
    summary: 'Verify Bank Account Details',
    description: 'Validates bank account details with the banking provider.'
  })
  @ApiQuery({
    name: 'bankCode',
    description: 'Bank code (mutually exclusive with bankName)',
    required: false,
    example: '044'
  })
  @ApiQuery({
    name: 'bankName',
    description: 'Bank name (mutually exclusive with bankCode)',
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
    description: 'Account verified successfully',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['success', 'error'] },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            account_name: { type: 'string', example: 'JOHN DOE' },
            account_number: { type: 'string', example: '0123456789' },
            bank_code: { type: 'string', example: '044' },
            bank_name: { type: 'string', example: 'Access Bank' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid parameters or verification failed',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 408,
    description: 'Bank verification service timeout',
    type: ErrorResponseDto
  })
  async verifyBankAccount(@Query(ValidationPipe) verifyDto: VerifyBankDto): Promise<NubapiResponse> {
    this.logger.log(`Verifying bank account with parameters: ${JSON.stringify(verifyDto)}`);
    
    if (verifyDto.bankCode && verifyDto.bankName) {
      throw new BadRequestException('Cannot provide both bank code and bank name. Please choose one.');
    }
    
    if (!verifyDto.bankCode && !verifyDto.bankName) {
      throw new BadRequestException('Either bank code or bank name must be provided.');
    }
    
    try {
      const result = await this.businessService.verifyBankDetails(
        verifyDto.accountNumber,
        verifyDto.bankCode,
        verifyDto.bankName
      );

      return result.responseData;
    } catch (error) {
      this.logger.error(`Bank verification failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 🔗 Link Bank Account
   * 
   * Links a verified bank account to a business. The account must be verified first
   * using the verify endpoint.
   * 
   * @endpoint PUT /businesses/:id/bank-account
   * @auth Required
   * 
   * @param {string} id - Business UUID
   * @body {Object} Bank Account Details
   * ```typescript
   * {
   *   accountNumber: string,
   *   bankCode?: string,      // Required if bankName not provided
   *   bankName?: string,      // Required if bankCode not provided
   *   accountType: 'POS' | 'TRANSFER' | 'BOTH'
   * }
   * ```
   * 
   * @returns {BusinessResponseDto} Updated Business Details
   * 
   * @example
   * ```typescript
   * // First verify the account
   * const verified = await api.get('/businesses/banks/verify', {
   *   params: { accountNumber: '0123456789', bankCode: '044' }
   * });
   * 
   * // Then link it to the business
   * if (verified.status === 'success') {
   *   const updated = await api.put(`/businesses/${businessId}/bank-account`, {
   *     accountNumber: verified.data.account_number,
   *     bankCode: verified.data.bank_code,
   *     accountType: 'POS'
   *   });
   *   
   *   // Check if business moved to next onboarding step
   *   if (updated.onboardingStep === 'ACCOUNT_SETUP') {
   *     // Ready for approval
   *   }
   * }
   * ```
   * 
   * @error 400 Bad Request - Invalid parameters or verification failed
   * @error 401 Unauthorized - Invalid or missing token
   * @error 403 Forbidden - User not authorized for this business
   * @error 404 Not Found - Business doesn't exist
   * @error 409 Conflict - Business in wrong state for bank linking
   */
  @Put(':id/bank-account')
  @ApiOperation({
    summary: 'Link Bank Account to Business',
    description: 'Links a verified bank account to a business.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Business UUID',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiBody({ 
    type: LinkBankDto,
    description: 'Bank account details for linking'
  })
  @ApiResponse({
    status: 200,
    description: 'Bank account linked successfully',
    type: BusinessResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid parameters or verification failed',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User not authorized for this business',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 409,
    description: 'Business in wrong state for bank linking',
    type: ErrorResponseDto
  })
  async updateBankAccount(
    @Param('id') id: string,
    @Body(new ValidationPipe({ 
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })) bankDto: LinkBankDto,
    @Req() req?: any
  ) {
    const ownerId = req?.user?.id;

    if (bankDto.bankCode && bankDto.bankName) {
      throw new BadRequestException('Cannot provide both bank code and bank name. Please choose one.');
    }

    if (!bankDto.bankCode && !bankDto.bankName) {
      throw new BadRequestException('Either bank code or bank name must be provided.');
    }

    const { bankCode: resolvedBankCode } = await this.resolveBankInfo(
      bankDto.bankCode, 
      bankDto.bankName
    );

    const updatedDto = {
      ...bankDto,
      bankCode: resolvedBankCode
    };

    return this.businessService.updateBankAccount(id, updatedDto, ownerId);
  }

  /**
   * 📋 List All Businesses
   * 
   * Retrieves a paginated list of businesses with optional filtering by verification status.
   * Results are ordered by creation date (newest first).
   * 
   * @endpoint GET /businesses
   * @auth Required
   * 
   * @query {number} [page=1] - Page number (1-based)
   * @query {number} [limit=10] - Results per page (max 100)
   * @query {boolean} [isVerified] - Filter by verification status
   * 
   * @returns {Object} Paginated Business List
   * ```typescript
   * {
   *   businesses: Array<{
   *     id: string,
   *     name: string,
   *     phoneNumber: string,
   *     isVerified: boolean,
   *     onboardingStep: string,
   *     walletAddress?: string,
   *     category?: {
   *       id: string,
   *       name: string
   *     }
   *   }>,
   *   total: number,    // Total matching businesses
   *   page: number,     // Current page
   *   limit: number     // Results per page
   * }
   * ```
   * 
   * @example
   * ```typescript
   * // Get first page of verified businesses
   * const page1 = await api.get('/businesses', {
   *   params: {
   *     isVerified: true,
   *     page: 1,
   *     limit: 20
   *   }
   * });
   * 
   * // Calculate total pages
   * const totalPages = Math.ceil(page1.total / page1.limit);
   * 
   * // Use in a table component
   * const BusinessTable = () => {
   *   const [page, setPage] = useState(1);
   *   const [businesses, setBusinesses] = useState([]);
   *   
   *   useEffect(() => {
   *     loadBusinesses(page);
   *   }, [page]);
   *   
   *   return (
   *     <Table data={businesses} />
   *   );
   * };
   * ```
   * 
   * @error 400 Bad Request - Invalid pagination parameters
   * @error 401 Unauthorized - Invalid or missing token
   */
  @Get()
  @ApiOperation({
    summary: 'List All Businesses',
    description: 'Retrieves a paginated list of businesses with optional filtering.'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    description: 'Page number (1-based)',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    description: 'Results per page (max 100)',
    example: 10
  })
  @ApiQuery({ 
    name: 'isVerified', 
    required: false, 
    description: 'Filter by verification status',
    example: true
  })
  @ApiResponse({
    status: 200,
    description: 'Businesses retrieved successfully',
    schema: { $ref: getSchemaPath(BusinessListResponseDto) }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid pagination parameters',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: ErrorResponseDto
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
    description: `Retrieves all available business categories with optional name filtering.
    
    Use Cases:
    - Business registration/setup
    - Category management
    - Business type classification
    
    Filtering:
    - Optional name parameter for searching categories
    - Case-insensitive partial matching
    - Returns all categories if no filter provided
    
    Response Structure:
    - Array of categories with details
    - Total count of matching categories
    - Each category includes:
      * Unique identifier
      * Name and description
      * Custom/system category flag
      * Active status
      * Timestamps
    
    Note: This endpoint is public and does not require authentication.
    Categories are pre-defined but may include custom entries.`
  })
  @ApiQuery({ 
    name: 'name', 
    required: false,
    description: 'Filter categories by name (case-insensitive partial match)',
    example: 'retail'
  })
  @ApiResponse({ 
    status: 200, 
    description: `Categories retrieved successfully. Response includes:
    - Array of matching categories
    - Total count of results
    - Category metadata and relationships`,
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
                }
              ],
              total: 2
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error while fetching categories',
    type: ErrorResponseDto
  })
  async getAllCategories(@Query('name') name?: string) {
    const result = await this.businessService.getAllCategories(name);
    
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
   * 🔍 Filter Businesses by State
   * 
   * Retrieves businesses filtered by their onboarding state. Useful for monitoring
   * business progress and managing approvals.
   * 
   * @endpoint GET /businesses/filter
   * @auth Required
   * 
   * @query {string} [state] - Onboarding state to filter by
   * @query {number} [page=1] - Page number (1-based)
   * @query {number} [limit=10] - Results per page (max 100)
   * 
   * @returns {Object} Filtered Business List
   * ```typescript
   * {
   *   businesses: Array<BusinessSummary>,
   *   total: number,
   *   page: number,
   *   limit: number,
   *   stateMetrics?: {
   *     NOT_STARTED: number,
   *     BUSINESS_SETUP: number,
   *     ACCOUNT_SETUP: number,
   *     APPROVED: number
   *   }
   * }
   * ```
   * 
   * @example
   * ```typescript
   * // Get businesses pending approval
   * const pending = await api.get('/businesses/filter', {
   *   params: {
   *     state: 'ACCOUNT_SETUP',
   *     page: 1,
   *     limit: 50
   *   }
   * });
   * 
   * // Build an approval queue
   * const ApprovalQueue = () => {
   *   const [queue, setQueue] = useState([]);
   *   
   *   useEffect(() => {
   *     const loadQueue = async () => {
   *       const { businesses } = await api.get('/businesses/filter', {
   *         params: { state: 'ACCOUNT_SETUP' }
   *       });
   *       setQueue(businesses);
   *     };
   *     
   *     loadQueue();
   *     // Refresh every 5 minutes
   *     const interval = setInterval(loadQueue, 300000);
   *     return () => clearInterval(interval);
   *   }, []);
   *   
   *   return (
   *     <QueueDisplay data={queue} />
   *   );
   * };
   * ```
   * 
   * @error 400 Bad Request - Invalid state or pagination parameters
   * @error 401 Unauthorized - Invalid or missing token
   */
  @Get('filter')
  @ApiOperation({ 
    summary: 'Filter Businesses by State',
    description: 'Retrieves businesses filtered by their onboarding state.'
  })
  @ApiQuery({ 
    name: 'state', 
    required: false, 
    enum: ['APPROVED', 'BUSINESS_SETUP', 'NOT_STARTED', 'all'],
    description: 'Onboarding state filter',
    example: 'ACCOUNT_SETUP'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number,
    description: 'Page number (1-based)',
    example: 1
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number,
    description: 'Results per page (max 100)',
    example: 10
  })
  @ApiResponse({
    status: 200,
    description: 'Filtered businesses retrieved successfully',
    schema: { $ref: getSchemaPath(BusinessListResponseDto) }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid state or pagination parameters',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: ErrorResponseDto
  })
  async getBusinessesByState(
    @Query('state') state?: 'APPROVED' | 'BUSINESS_SETUP' | 'NOT_STARTED' | 'all',
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.businessService.getBusinessesByState(
      state,
      page || 1,
      limit || 10
    );
  }

  /**
   * ✅ Approve Business
   * 
   * Admin endpoint to approve a business and initiate wallet generation.
   * This is the final step in business onboarding.
   * 
   * @endpoint POST /businesses/:id/approve
   * @auth Required (Admin Only)
   * 
   * @param {string} id - Business UUID
   * 
   * @returns {BusinessResponseDto} Approved Business Details
   * 
   * @example
   * ```typescript
   * // Approve a business
   * const approve = async (businessId) => {
   *   try {
   *     const result = await api.post(`/businesses/${businessId}/approve`);
   *     
   *     if (result.onboardingStep === 'APPROVED') {
   *       // Success! Now wait for wallet
   *       if (!result.walletAddress) {
   *         // Wallet is being generated
   *         startPolling(businessId);
   *       }
   *     }
   *   } catch (error) {
   *     if (error.response?.status === 400) {
   *       // Business not ready for approval
   *       showError(error.response.data.message);
   *     }
   *   }
   * };
   * 
   * // Poll for wallet generation
   * const startPolling = (businessId) => {
   *   const interval = setInterval(async () => {
   *     const business = await api.get(`/businesses/${businessId}`);
   *     if (business.walletAddress) {
   *       clearInterval(interval);
   *       showSuccess('Wallet generated!');
   *     }
   *   }, 5000); // Check every 5 seconds
   *   
   *   // Stop polling after 2 minutes
   *   setTimeout(() => clearInterval(interval), 120000);
   * };
   * ```
   * 
   * @error 400 Bad Request - Business not ready for approval
   * @error 401 Unauthorized - Invalid or missing token
   * @error 403 Forbidden - User not authorized for approvals
   * @error 404 Not Found - Business doesn't exist
   */
  @Post(':id/approve')
  @ApiOperation({ 
    summary: 'Approve Business',
    description: 'Admin endpoint to approve a business and initiate wallet generation.'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Business UUID',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({
    status: 200,
    description: 'Business approved successfully',
    schema: { $ref: getSchemaPath(BusinessResponseDto) }
  })
  @ApiResponse({
    status: 400,
    description: 'Business not ready for approval',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User not authorized for approvals',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    type: ErrorResponseDto
  })
  async approveBusiness(@Param('id') businessId: string) {
    return this.businessService.approveBusiness(businessId);
  }

  /**
   * ⛔ Deactivate Business
   * 
   * Temporarily suspends a business's operations. The business can be identified
   * by either its ID or wallet address.
   * 
   * @endpoint POST /businesses/deactivate
   * @auth Required (Admin Only)
   * 
   * @body {Object} Deactivation Request
   * ```typescript
   * {
   *   identifier: string,     // Business ID or wallet address
   *   identifierType: 'id' | 'wallet'
   * }
   * ```
   * 
   * @returns {BusinessResponseDto} Updated Business Details
   * 
   * @example
   * ```typescript
   * // Deactivate by ID
   * const deactivateById = async (businessId) => {
   *   try {
   *     await api.post('/businesses/deactivate', {
   *       identifier: businessId,
   *       identifierType: 'id'
   *     });
   *     showSuccess('Business deactivated');
   *   } catch (error) {
   *     handleError(error);
   *   }
   * };
   * 
   * // Deactivate by wallet
   * const deactivateByWallet = async (walletAddress) => {
   *   try {
   *     await api.post('/businesses/deactivate', {
   *       identifier: walletAddress,
   *       identifierType: 'wallet'
   *     });
   *     showSuccess('Business deactivated');
   *   } catch (error) {
   *     handleError(error);
   *   }
   * };
   * 
   * // Error handling helper
   * const handleError = (error) => {
   *   if (error.response?.status === 404) {
   *     showError('Business not found');
   *   } else if (error.response?.status === 400) {
   *     showError(error.response.data.message);
   *   } else {
   *     showError('Failed to deactivate business');
   *   }
   * };
   * ```
   * 
   * @error 400 Bad Request - Invalid request or business state
   * @error 401 Unauthorized - Invalid or missing token
   * @error 403 Forbidden - User not authorized for deactivation
   * @error 404 Not Found - Business not found
   */
  @Post('deactivate')
  @ApiOperation({ 
    summary: 'Deactivate Business',
    description: 'Temporarily suspends a business\'s operations.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Business ID or wallet address',
          example: '123e4567-e89b-12d3-a456-426614174000'
        },
        identifierType: {
          type: 'string',
          enum: ['id', 'wallet'],
          description: 'Type of identifier provided',
          example: 'id'
        }
      },
      required: ['identifier', 'identifierType']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Business deactivated successfully',
    schema: { $ref: getSchemaPath(BusinessResponseDto) }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or business state',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User not authorized for deactivation',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    type: ErrorResponseDto
  })
  async deactivateBusiness(
    @Body('identifier') identifier: string,
    @Body('identifierType') identifierType: 'id' | 'wallet'
  ) {
    return this.businessService.deactivateBusinessByIdentifier(identifier, identifierType);
  }

  /**
   * ✅ Reactivate Business
   * 
   * Restores a previously deactivated business's operations. The business can be
   * identified by either its ID or wallet address.
   * 
   * @endpoint POST /businesses/reactivate
   * @auth Required (Admin Only)
   * 
   * @body {Object} Reactivation Request
   * ```typescript
   * {
   *   identifier: string,     // Business ID or wallet address
   *   identifierType: 'id' | 'wallet'
   * }
   * ```
   * 
   * @returns {BusinessResponseDto} Updated Business Details
   * 
   * @example
   * ```typescript
   * // Component for managing business status
   * const BusinessStatusManager = ({ business }) => {
   *   const [isLoading, setLoading] = useState(false);
   *   const [error, setError] = useState(null);
   *   
   *   const toggleStatus = async () => {
   *     setLoading(true);
   *     setError(null);
   *     
   *     try {
   *       const endpoint = business.isActive ? 'deactivate' : 'reactivate';
   *       await api.post(`/businesses/${endpoint}`, {
   *         identifier: business.id,
   *         identifierType: 'id'
   *       });
   *       
   *       // Refresh business data
   *       await refetchBusiness();
   *     } catch (error) {
   *       setError(error.response?.data?.message || 'Operation failed');
   *     } finally {
   *       setLoading(false);
   *     }
   *   };
   *   
   *   return (
   *     <div>
   *       <Button
   *         onClick={toggleStatus}
   *         disabled={isLoading}
   *         variant={business.isActive ? 'danger' : 'success'}
   *       >
   *         {business.isActive ? 'Deactivate' : 'Reactivate'} Business
   *       </Button>
   *       {error && <ErrorAlert message={error} />}
   *     </div>
   *   );
   * };
   * ```
   * 
   * @error 400 Bad Request - Invalid request or business state
   * @error 401 Unauthorized - Invalid or missing token
   * @error 403 Forbidden - User not authorized for reactivation
   * @error 404 Not Found - Business not found
   */
  @Post('reactivate')
  @ApiOperation({ 
    summary: 'Reactivate Business',
    description: 'Restores a previously deactivated business\'s operations.'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Business ID or wallet address',
          example: '123e4567-e89b-12d3-a456-426614174000'
        },
        identifierType: {
          type: 'string',
          enum: ['id', 'wallet'],
          description: 'Type of identifier provided',
          example: 'id'
        }
      },
      required: ['identifier', 'identifierType']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Business reactivated successfully',
    schema: { $ref: getSchemaPath(BusinessResponseDto) }
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or business state',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User not authorized for reactivation',
    type: ErrorResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Business not found',
    type: ErrorResponseDto
  })
  async reactivateBusiness(
    @Body('identifier') identifier: string,
    @Body('identifierType') identifierType: 'id' | 'wallet'
  ) {
    return this.businessService.reactivateBusinessByIdentifier(identifier, identifierType);
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
}