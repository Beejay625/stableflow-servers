import { ApiProperty } from '@nestjs/swagger';
import { OnboardingStep } from '../entities/business.entity';

/**
 * Simplified Business Response DTO
 * Contains only essential information needed for the client
 */
export class SimplifiedBusinessResponseDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  id: string;

  @ApiProperty({ example: 'Business Name' })
  name: string;

  @ApiProperty({ example: '1234567890' })
  phoneNumber: string;

  @ApiProperty({ example: false })
  isVerified: boolean;

  @ApiProperty({ enum: OnboardingStep, example: OnboardingStep.NOT_STARTED })
  onboardingStep: OnboardingStep;

  @ApiProperty({ example: 'USD' })
  settlementCurrency: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-01-01T00:00:00Z' })
  createdAt: Date;
  
  @ApiProperty({ example: '2023-01-01T00:00:00Z' })
  updatedAt: Date;
}

/**
 * Category information in simplified form
 */
export class SimplifiedCategoryDto {
  @ApiProperty({ example: 'category-123' })
  id: string;

  @ApiProperty({ example: 'Retail' })
  name: string;
} 