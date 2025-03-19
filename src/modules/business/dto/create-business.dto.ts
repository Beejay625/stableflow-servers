import { IsNotEmpty, IsString, IsOptional, Length, IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for creating or updating a business
 * All fields are optional to support partial updates with PATCH
 */
export class CreateBusinessDto {
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
  @IsUUID()
  @ApiProperty({
    description: 'ID of an existing category',
    example: 'category-123',
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