import { Injectable } from '@nestjs/common';
import { BaseHttpService } from './base-http.service';
import {
  Currency,
  Institution,
  OfframpRequest,
  OfframpResponse,
  PaycrestResponse,
  VerifyAccountRequest,
} from '../interfaces/paycrest.interface';

@Injectable()
export class PaycrestApiService extends BaseHttpService {
  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    super(baseUrl, {
      headers: {
        'API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Verifies a bank account through Paycrest
   * @param verifyAccountRequest Account verification request 
   * @returns Account name if successful
   */
  async verifyAccount(
    verifyAccountRequest: VerifyAccountRequest,
  ): Promise<PaycrestResponse<string>> {
    return this.post<PaycrestResponse<string>>(
      '/verify-account',
      verifyAccountRequest,
    );
  }

  /**
   * Gets a list of supported financial institutions for a currency
   * @param currencyCode The currency code to get institutions for
   * @returns List of supported institutions
   */
  async getSupportedInstitutions(
    currencyCode: string,
  ): Promise<PaycrestResponse<Institution[]>> {
    return this.get<PaycrestResponse<Institution[]>>(
      `/institutions/${currencyCode}`,
    );
  }

  /**
   * Gets a list of supported currencies
   * @returns List of supported currencies
   */
  async getSupportedCurrencies(): Promise<PaycrestResponse<Currency[]>> {
    return this.get<PaycrestResponse<Currency[]>>('/currencies');
  }

  /**
   * Initiates an offramp transaction to convert crypto to fiat
   * @param offrampRequest Offramp request details
   * @returns Details of the initiated offramp
   */
  async initiateOfframp(
    offrampRequest: OfframpRequest,
  ): Promise<PaycrestResponse<OfframpResponse>> {
    return this.post<PaycrestResponse<OfframpResponse>>(
      '/offramp',
      offrampRequest,
    );
  }

  /**
   * Gets the status of an offramp order
   * @param orderId The ID of the order to check
   * @returns Status and details of the offramp order
   */
  async getOfframpStatus(
    orderId: string,
  ): Promise<PaycrestResponse<OfframpResponse>> {
    return this.get<PaycrestResponse<OfframpResponse>>(`/offramp/${orderId}`);
  }
} 