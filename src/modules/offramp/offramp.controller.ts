import { 
  Controller, 
  Post, 
  Body, 
  Logger, 
  HttpCode, 
  Res,
  HttpStatus,
  Get,
  Param
} from '@nestjs/common';
import { OfframpService } from './offramp.service';
import { ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookPayload } from './interfaces/webhook.interface';

@ApiTags('Offramp')
@Controller('offramp')
export class OfframpController {
  private readonly logger = new Logger(OfframpController.name);

  constructor(private readonly offrampService: OfframpService) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle offramp provider webhooks' })
  async handleWebhook(
    @Body() payload: WebhookPayload,
    @Res() response: Response
  ): Promise<void> {
    try {
      // Immediately acknowledge webhook to prevent retries
      this.logger.log(`[DEBUG] Received webhook event: ${payload.event} for order: ${payload.data?.id}`);
      this.logger.log(`[DEBUG] Webhook payload details: ${JSON.stringify(payload.data, null, 2)}`);
      
      response.status(HttpStatus.OK).send({ status: 'acknowledged' });
      
      // Process webhook asynchronously
      this.logger.log(`[DEBUG] Starting asynchronous webhook processing for order ${payload.data?.id}`);
      this.offrampService.handleWebhook(payload)
        .then(() => {
          this.logger.log(`[DEBUG] Successfully processed webhook for order ${payload.data?.id}`);
        })
        .catch(error => {
          this.logger.error(
            `[DEBUG] Error processing webhook for order ${payload.data?.id}: ${error.message}`,
            error.stack
          );
        });
    } catch (error) {
      this.logger.error(`[DEBUG] Error handling webhook: ${error.message}`, error.stack);
      // Still acknowledge to prevent retries, but log the error
      response.status(HttpStatus.OK).send({ status: 'acknowledged', error: 'Processing error' });
    }
  }

  @Post('process/:transactionId')
  @ApiOperation({ summary: 'Process a transaction directly' })
  @ApiParam({ name: 'transactionId', description: 'ID of the transaction to process' })
  async processTransaction(
    @Param('transactionId') transactionId: string
  ) {
    this.logger.log(`Manual processing request for transaction: ${transactionId}`);
    return this.offrampService.processTransaction(transactionId);
  }

  @Get('check/:transactionId')
  @ApiOperation({ summary: 'Check status of a transaction and attempt recovery if needed' })
  @ApiParam({ name: 'transactionId', description: 'ID of the transaction to check' })
  async checkTransactionStatus(
    @Param('transactionId') transactionId: string
  ) {
    this.logger.log(`Status check request for transaction: ${transactionId}`);
    
    // Call a new method we'll add to the service
    return this.offrampService.checkAndRecoverTransaction(transactionId);
  }
} 