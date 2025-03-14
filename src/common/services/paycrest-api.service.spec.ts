import { Test, TestingModule } from '@nestjs/testing';
import { PaycrestApiService } from './paycrest-api.service';
import { HttpErrorException } from '../exceptions';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PaycrestApiService', () => {
  let service: PaycrestApiService;
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.paycrest.test/v1';
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
    } as any);
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PaycrestApiService,
          useFactory: () => new PaycrestApiService(mockBaseUrl, mockApiKey),
        },
      ],
    }).compile();

    service = module.get<PaycrestApiService>(PaycrestApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyAccount', () => {
    it('should verify an account successfully', async () => {
      // Given
      const verifyAccountRequest = {
        institution: 'FBNINGLA',
        accountIdentifier: '123456789',
      };

      const mockResponse = {
        data: {
          message: 'Account name was fetched successfully',
          status: 'success',
          data: 'John Doe',
        },
      };

      (service as any).post = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.verifyAccount(verifyAccountRequest);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).post).toHaveBeenCalledWith(
        '/verify-account',
        verifyAccountRequest,
      );
    });

    it('should handle API errors', async () => {
      // Given
      const verifyAccountRequest = {
        institution: 'INVALID',
        accountIdentifier: '123456789',
      };

      (service as any).post = jest.fn().mockRejectedValue(
        new HttpErrorException('Institution not found', 404, 'NOT_FOUND'),
      );

      // When/Then
      await expect(service.verifyAccount(verifyAccountRequest)).rejects.toThrow(
        HttpErrorException,
      );
    });
  });

  describe('getSupportedInstitutions', () => {
    it('should fetch supported institutions for a currency', async () => {
      // Given
      const currencyCode = 'NGN';
      const mockResponse = {
        data: {
          message: 'OK',
          status: 'success',
          data: [
            {
              name: 'GT Bank Plc',
              code: 'GTBINGLA',
              type: 'bank',
            },
            {
              name: 'First Bank of Nigeria',
              code: 'FBNINGLA',
              type: 'bank',
            },
          ],
        },
      };

      (service as any).get = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.getSupportedInstitutions(currencyCode);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).get).toHaveBeenCalledWith(
        `/institutions/${currencyCode}`,
      );
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should fetch supported currencies', async () => {
      // Given
      const mockResponse = {
        data: {
          message: 'OK',
          status: 'success',
          data: [
            {
              code: 'NGN',
              name: 'Nigerian Naira',
              shortName: 'Naira',
              decimals: 2,
              symbol: '₦',
              marketRate: '1629.59',
            },
          ],
        },
      };

      (service as any).get = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.getSupportedCurrencies();

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).get).toHaveBeenCalledWith('/currencies');
    });
  });

  describe('initiateOfframp', () => {
    it('should initiate an offramp transaction', async () => {
      // Given
      const offrampRequest = {
        amount: '100',
        currency: 'NGN',
        institution: 'FBNINGLA',
        accountIdentifier: '123456789',
        reference: 'tx-123456',
      };

      const mockResponse = {
        data: {
          message: 'Offramp initiated successfully',
          status: 'success',
          data: {
            orderId: 'order-123456',
            status: 'processing',
            amount: '100',
            currency: 'USDT',
            settlement: {
              amount: '163000',
              currency: 'NGN',
              accountName: 'John Doe',
              accountIdentifier: '123456789',
              institution: 'FBNINGLA',
            },
          },
        },
      };

      (service as any).post = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.initiateOfframp(offrampRequest);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).post).toHaveBeenCalledWith(
        '/offramp',
        offrampRequest,
      );
    });
  });

  describe('getOfframpStatus', () => {
    it('should fetch the status of an offramp order', async () => {
      // Given
      const orderId = 'order-123456';
      const mockResponse = {
        data: {
          message: 'Order status fetched successfully',
          status: 'success',
          data: {
            orderId: 'order-123456',
            status: 'completed',
            amount: '100',
            currency: 'USDT',
            settlement: {
              amount: '163000',
              currency: 'NGN',
              accountName: 'John Doe',
              accountIdentifier: '123456789',
              institution: 'FBNINGLA',
            },
            txHash: '0x1234567890abcdef',
          },
        },
      };

      (service as any).get = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.getOfframpStatus(orderId);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).get).toHaveBeenCalledWith(`/offramp/${orderId}`);
    });
  });
}); 