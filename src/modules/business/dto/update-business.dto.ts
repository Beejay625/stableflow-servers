import { IsNotEmpty, IsString, IsOptional, Length, IsUUID, Matches, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OnboardingStep } from '../entities/business.entity';

/**
 * DTO for updating a business entity
 * Contains all fields that can be updated via PATCH
 */
export class UpdateBusinessDto {
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
  @IsString()
  @Length(0, 500)
  @ApiProperty({
    description: 'Business description',
    example: 'A small retail business selling handmade crafts',
    required: false
  })
  description?: string;

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

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Settlement currency for the business',
    example: 'USD',
    required: false
  })
  settlementCurrency?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether the business is active',
    example: true,
    required: false
  })
  isActive?: boolean;
} 