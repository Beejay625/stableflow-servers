import { IsNotEmpty, IsString, IsOptional, Length, IsUUID, Matches, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OnboardingStep } from '../entities/business.entity';

/**
 * DTO for both creating and updating a business entity
 * All fields are optional to support:
 * 1. Partial creation (step by step onboarding)
 * 2. Partial updates (PATCH operations)
 */
export class BusinessDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @ApiProperty({
    description: 'Business name',
    example: 'My Awesome Business',
    required: false
  })
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone number must be in international format (e.g., +1234567890)',
  })
  @ApiProperty({
    description: 'Business phone number in international format',
    example: '+2347012345678',
    required: false
  })
  phoneNumber?: string;

  @IsOptional()
  @IsUUID('all', {
    message: 'categoryId must be a valid UUID format (e.g., 123e4567-e89b-12d3-a456-426614174000)'
  })
  @ApiProperty({
    description: 'ID of an existing category',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false
  })
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  @ApiProperty({
    description: 'Name for a new category if categoryId is not provided',
    example: 'Retail Store',
    required: false
  })
  categoryName?: string;
} 