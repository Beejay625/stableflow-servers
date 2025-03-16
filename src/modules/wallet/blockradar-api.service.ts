import { Injectable } from '@nestjs/common';
import { BaseHttpService } from '../../common/services/base-http.service';
import { Address, BlockradarResponse } from './interfaces/blockradar.interface';

@Injectable()
export class BlockradarApiService extends BaseHttpService {
  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    super(baseUrl, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Generates a new wallet address
   * @param walletId The wallet ID to associate the address with
   * @param request Address request parameters
   * @returns Generated address details
   */
  async generateAddress(
    walletId: string,
    request: any,
  ): Promise<BlockradarResponse<Address>> {
    return this.post<BlockradarResponse<Address>>(
      `/wallets/${walletId}/addresses`,
      request,
    );
  }

  /**
   * Gets address details by ID
   * @param addressId The ID of the address
   * @returns Address details
   */
  async getAddress(addressId: string): Promise<BlockradarResponse<Address>> {
    return this.get<BlockradarResponse<Address>>(`/addresses/${addressId}`);
  }

  /**
   * Gets transactions for an address
   * @param addressId The ID of the address
   * @returns Transactions associated with the address
   */
  async getAddressTransactions(
    addressId: string,
  ): Promise<BlockradarResponse<any[]>> {
    return this.get<BlockradarResponse<any[]>>(
      `/addresses/${addressId}/transactions`,
    );
  }

  /**
   * Gets transaction details by ID
   * @param transactionId The ID of the transaction
   * @returns Transaction details
   */
  async getTransaction(
    transactionId: string,
  ): Promise<BlockradarResponse<any>> {
    return this.get<BlockradarResponse<any>>(`/transactions/${transactionId}`);
  }

  /**
   * Gets all addresses for a wallet
   * @param walletId The ID of the wallet
   * @returns List of addresses
   */
  async getWalletAddresses(
    walletId: string,
  ): Promise<BlockradarResponse<Address[]>> {
    return this.get<BlockradarResponse<Address[]>>(
      `/wallets/${walletId}/addresses`,
    );
  }
} 