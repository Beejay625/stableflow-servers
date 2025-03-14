import { Injectable } from '@nestjs/common';
import { BaseHttpService } from './base-http.service';
import {
  Address,
  BlockradarResponse,
  GenerateAddressRequest,
  Transaction,
} from '../interfaces/blockradar.interface';

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
   * Generates a new wallet address for a specific wallet
   * @param walletId The ID of the wallet to generate an address for
   * @param generateAddressRequest Address generation options
   * @returns The generated address
   */
  async generateAddress(
    walletId: string,
    generateAddressRequest: GenerateAddressRequest,
  ): Promise<BlockradarResponse<Address>> {
    return this.post<BlockradarResponse<Address>>(
      `/wallets/${walletId}/addresses`,
      generateAddressRequest,
    );
  }

  /**
   * Gets a wallet address by ID
   * @param addressId The ID of the address to retrieve
   * @returns The address details
   */
  async getAddress(addressId: string): Promise<BlockradarResponse<Address>> {
    return this.get<BlockradarResponse<Address>>(`/addresses/${addressId}`);
  }

  /**
   * Gets all transactions for a specific address
   * @param addressId The ID of the address to get transactions for
   * @returns List of transactions for the address
   */
  async getAddressTransactions(
    addressId: string,
  ): Promise<BlockradarResponse<Transaction[]>> {
    return this.get<BlockradarResponse<Transaction[]>>(
      `/addresses/${addressId}/transactions`,
    );
  }

  /**
   * Gets a transaction by ID
   * @param transactionId The ID of the transaction to retrieve
   * @returns The transaction details
   */
  async getTransaction(
    transactionId: string,
  ): Promise<BlockradarResponse<Transaction>> {
    return this.get<BlockradarResponse<Transaction>>(
      `/transactions/${transactionId}`,
    );
  }

  /**
   * Gets all addresses for a specific wallet
   * @param walletId The ID of the wallet to get addresses for
   * @returns List of addresses for the wallet
   */
  async getWalletAddresses(
    walletId: string,
  ): Promise<BlockradarResponse<Address[]>> {
    return this.get<BlockradarResponse<Address[]>>(
      `/wallets/${walletId}/addresses`,
    );
  }
} 