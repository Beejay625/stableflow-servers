import { Test, TestingModule } from '@nestjs/testing';
import { PaycrestService } from './paycrest.service';
import { ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { AxiosResponse } from 'axios';
import { of } from 'rxjs';
import { HttpErrorException } from '../../common/exceptions/http-error.exception';
import { API_PATHS } from './constants';

describe('PaycrestService', () => {
  let service: PaycrestService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key) => {
      if (key === 'paycrest.apiKey') return '208a4aef-1320-4222-82b4-e3bca8781b4b';
      if (key === 'paycrest.baseUrl') return 'https://api.paycrest.io';
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [
        PaycrestService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PaycrestService>(PaycrestService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should set headers with API key from config', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('paycrest.apiKey');
      expect((service as any).headers).toHaveProperty('API-Key', '208a4aef-1320-4222-82b4-e3bca8781b4b');
      expect((service as any).headers).toHaveProperty('Content-Type', 'application/json');
    });
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

      // Mock the HTTP client
      (service as any).httpClient.post = jest.fn().mockResolvedValue(mockResponse);

      // When
      const result = await service.verifyAccount(verifyAccountRequest);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).httpClient.post).toHaveBeenCalledWith(
        API_PATHS.VERIFY_ACCOUNT,
        verifyAccountRequest,
      );
    });

    it('should handle API errors', async () => {
      // Given
      const verifyAccountRequest = {
        institution: 'INVALID',
        accountIdentifier: '123456789',
      };

      // Mock the HTTP client to throw an error
      (service as any).httpClient.post = jest.fn().mockRejectedValue(
        new HttpErrorException('Institution not found', 404, 'NOT_FOUND'),
      );

      // When/Then
      await expect(service.verifyAccount(verifyAccountRequest)).rejects.toThrow(
        HttpErrorException,
      );
    });
  });

  describe('getSupportedInstitutions', () => {
    it('should return supported institutions successfully', async () => {
      // Given
      const mockResponse = {
        data: {
          message: 'Institutions fetched successfully',
          status: 'success',
          data: [
            { name: 'First Bank', code: 'FBNINGLA', type: 'bank' },
            { name: 'GT Bank', code: 'GTBINGLA', type: 'bank' },
          ],
        },
      };

      // Mock the HTTP client
      (service as any).httpClient.get = jest.fn().mockResolvedValue(mockResponse);

      // When
      const result = await service.getSupportedInstitutions();

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).httpClient.get).toHaveBeenCalledWith(API_PATHS.INSTITUTIONS);
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return supported currencies successfully', async () => {
      // Given
      const mockResponse = {
        data: {
          message: 'Currencies fetched successfully',
          status: 'success',
          data: [
            { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
            { code: 'USD', name: 'US Dollar', symbol: '$' },
          ],
        },
      };

      // Mock the HTTP client
      (service as any).httpClient.get = jest.fn().mockResolvedValue(mockResponse);

      // When
      const result = await service.getSupportedCurrencies();

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).httpClient.get).toHaveBeenCalledWith(API_PATHS.CURRENCIES);
    });
  });

  describe('getExchangeRate', () => {
    it('should return exchange rate information successfully', async () => {
      // Given
      const exchangeRateRequest = {
        sourceCurrency: 'NGN',
        targetCurrency: 'USD',
        amount: 1000,
      };

      const mockResponse = {
        data: {
          message: 'Exchange rate fetched successfully',
          status: 'success',
          data: {
            rate: 0.0022,
            convertedAmount: 2.2,
            fee: 0.1,
          },
        },
      };

      // Mock the HTTP client
      (service as any).httpClient.post = jest.fn().mockResolvedValue(mockResponse);

      // When
      const result = await service.getExchangeRate(exchangeRateRequest);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).httpClient.post).toHaveBeenCalledWith(
        API_PATHS.EXCHANGE_RATE,
        exchangeRateRequest,
      );
    });
  });
}); 