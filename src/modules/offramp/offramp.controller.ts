import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { OfframpService } from "./offramp.service";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { WebhookPayload, WebhookHandler } from "./handlers/webhook.handler";

@ApiTags("Offramp")
@Controller("offramp")
export class OfframpController {
  private readonly logger = new Logger(OfframpController.name);

  constructor(
    private readonly offrampService: OfframpService, 
    private readonly webhookHandler: WebhookHandler
  ) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Handle offramp provider webhooks" })
  async handleWebhook(
    @Body() payload: WebhookPayload,
    @Res() response: Response,
  ): Promise<void> {
    try {
      // Immediately acknowledge webhook to prevent retries
      this.logger.log(`Received webhook event: ${payload.event} for order: ${payload.data?.id}`);

      // Send immediate acknowledgment response
      response.status(HttpStatus.OK).send({ status: "acknowledged" });

      // Process webhook asynchronously
      this.webhookHandler
        .handleWebhook(payload)
        .then(() => {
          this.logger.log(`Successfully processed webhook for order ${payload.data?.id}`);
        })
        .catch((error) => {
          this.logger.error(`Error processing webhook for order ${payload.data?.id}: ${error.message}`);
        });
    } catch (error) {
      this.logger.error(`Error handling webhook: ${error.message}`);
      // Still acknowledge to prevent retries, but log the error
      response
        .status(HttpStatus.OK)
        .send({ status: "acknowledged", error: "Processing error" });
    }
  }
}
