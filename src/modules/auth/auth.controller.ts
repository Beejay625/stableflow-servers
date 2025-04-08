import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import {
  RequestOtpDto,
  AuthResponseDto,
  ValidateOtpDto,
  BusinessAuthResponseDto,
} from "./dto";
import { Public } from "../../common/decorators/public.decorator";
import { normalizeEmail } from "../../common/utils";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @ApiOperation({ summary: "Request OTP for authentication" })
  @ApiResponse({
    status: 200,
    description: "OTP sent successfully",
    type: AuthResponseDto,
  })
  @ApiBody({ type: RequestOtpDto })
  @Post("request-otp")
  @HttpCode(HttpStatus.OK)
  async requestOtp(
    @Body() requestOtpDto: RequestOtpDto,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = normalizeEmail(requestOtpDto.email);
    this.logger.log(`OTP requested for email: ${normalizedEmail}`);
    return this.authService.generateOtp(normalizedEmail);
  }

  @Public()
  @ApiOperation({ summary: "Verify OTP and authenticate user" })
  @ApiResponse({
    status: 200,
    description: "Authentication successful with business ID",
    type: BusinessAuthResponseDto,
  })
  @ApiResponse({ status: 401, description: "Invalid or expired OTP" })
  @ApiBody({ type: ValidateOtpDto })
  @Post("verify-otp")
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() validateOtpDto: ValidateOtpDto,
  ): Promise<BusinessAuthResponseDto> {
    const normalizedEmail = normalizeEmail(validateOtpDto.email);
    this.logger.log(`Verifying OTP for email: ${normalizedEmail}`);

    const response = await this.authService.verifyOtpWithBusinessId(
      normalizedEmail,
      validateOtpDto.otp,
    );

    // Ensure businessId is not null
    if (!response.businessId) {
      this.logger.warn(
        `Business ID is null or undefined in response! Creating temporary ID.`,
      );
      response.businessId = `temp-${Date.now()}`;
    }

    this.logger.log(
      `Authentication successful for ${normalizedEmail} with business ID: ${response.businessId}`,
    );
    this.logger.log(`Final response object: ${JSON.stringify(response)}`);

    return response;
  }
}
