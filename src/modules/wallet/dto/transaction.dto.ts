import { ApiProperty } from "@nestjs/swagger";

/**
 * DTO for transaction response
 */
export class TransactionResponseDto {
  @ApiProperty({ description: "Transaction ID" })
  transactionId: string;

  @ApiProperty({ description: "Business ID" })
  businessId: string;

  @ApiProperty({ description: "Token amount" })
  tokenAmount: number;

  @ApiProperty({ description: "Token symbol" })
  token: string;

  @ApiProperty({ description: "Blockchain name" })
  chain: string;

  @ApiProperty({ description: "Transaction status" })
  status: string;

  @ApiProperty({ description: "Sender address" })
  senderAddress: string;

  @ApiProperty({ description: "Business address" })
  businessAddress: string;

  @ApiProperty({ description: "Date transaction was received" })
  receivedAt: Date;
}

/**
 * DTO for transaction statistics
 */
export class TransactionStatsDto {
  @ApiProperty({ description: "Transaction counts by status" })
  status: Record<string, number>;

  @ApiProperty({ description: "Total transaction count and value" })
  total: {
    count: number;
    amount: number;
  };

  @ApiProperty({ description: "Recent transaction data" })
  recent: {
    last30Days: number;
  };

  @ApiProperty({ description: "Top businesses by transaction volume" })
  byBusiness: any[];
}

/**
 * DTO for pagination results
 */
export class PaginatedTransactionsDto {
  @ApiProperty({ description: "List of transactions", type: [TransactionResponseDto] })
  transactions: TransactionResponseDto[];

  @ApiProperty({ description: "Total number of transactions" })
  total: number;
} 