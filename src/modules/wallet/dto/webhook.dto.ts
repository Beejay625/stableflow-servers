import { ApiProperty } from "@nestjs/swagger";

/**
 * DTO for webhook payloads
 */
export class WebhookDto {
  @ApiProperty({ description: "Webhook event data" })
  data: any;
}
