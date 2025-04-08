import { ApiProperty } from "@nestjs/swagger";

/**
 * DTO for resend webhook request
 */
export class ResendWebhookResponseDto {
  @ApiProperty({ description: "Whether the request was successful" })
  success: boolean;

  @ApiProperty({ description: "Response message" })
  message: string;
} 