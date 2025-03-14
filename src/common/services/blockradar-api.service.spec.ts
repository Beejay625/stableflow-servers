import { Test, TestingModule } from '@nestjs/testing';
import { BlockradarApiService } from './blockradar-api.service';
import { HttpErrorException } from '../exceptions';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BlockradarApiService', () => {
  let service: BlockradarApiService;
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.blockradar.co/v1';
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
    } as any);
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: BlockradarApiService,
          useFactory: () => new BlockradarApiService(mockBaseUrl, mockApiKey),
        },
      ],
    }).compile();

    service = module.get<BlockradarApiService>(BlockradarApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAddress', () => {
    it('should generate a wallet address successfully', async () => {
      // Given
      const walletId = 'test-wallet-id';
      const generateAddressRequest = {
        disableAutoSweep: false,
        enableGaslessWithdraw: false,
        showPrivateKey: false,
        metadata: { business_id: '123', account_number: '987654321' },
        name: 'Business Name',
      };

      const mockResponse = {
        data: {
          statusCode: 200,
          message: 'Address generated successfully',
          data: {
            address: '0xe1037B45b48390285e5067424053fa35c478296b',
            blockchain: {
              id: '85ffc132-3972-4c9e-99a5-5cf0ccb688bf',
              name: 'ethereum',
              slug: 'ethereum',
              symbol: 'eth',
              isEvmCompatible: true,
              tokenStandard: 'ERC20',
              logoUrl: 'https://example.com/eth-logo.png',
              isActive: true,
              createdAt: '2024-05-14T11:53:33.095Z',
              updatedAt: '2024-06-14T22:32:11.983Z',
              derivationPath: 'm/44\'/60\'/0\'/0',
            },
            configurations: {
              aml: {
                message: 'Address is not sanctioned',
                provider: 'ofac',
                status: 'success'
              },
              disableAutoSweep: false,
              enableGaslessWithdraw: false,
              showPrivateKey: false,
            },
            createdAt: '2024-10-23T11:13:40.446Z',
            derivationPath: 'm/44\'/60\'/0\'/0/87',
            id: '0a69c48a-6c6f-422c-bd6a-70de3306a3ac',
            isActive: true,
            metadata: {
              business_id: '123',
              account_number: '987654321',
            },
            name: 'Business Name',
            network: 'testnet',
            type: 'INTERNAL',
            updatedAt: '2024-10-23T11:13:40.446Z',
          },
        },
      };

      (service as any).post = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.generateAddress(walletId, generateAddressRequest);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).post).toHaveBeenCalledWith(
        `/wallets/${walletId}/addresses`,
        generateAddressRequest,
      );
    });

    it('should handle API errors', async () => {
      // Given
      const walletId = 'invalid-wallet-id';
      const generateAddressRequest = {
        name: 'Test',
      };

      (service as any).post = jest.fn().mockRejectedValue(
        new HttpErrorException('Wallet not found', 404, 'NOT_FOUND'),
      );

      // When/Then
      await expect(service.generateAddress(walletId, generateAddressRequest)).rejects.toThrow(
        HttpErrorException,
      );
    });
  });

  describe('getAddress', () => {
    it('should get a wallet address by ID', async () => {
      // Given
      const addressId = 'test-address-id';
      const mockResponse = {
        data: {
          statusCode: 200,
          message: 'Address fetched successfully',
          data: {
            address: '0xe1037B45b48390285e5067424053fa35c478296b',
            id: 'test-address-id',
            name: 'Business Name',
            isActive: true,
            // other fields omitted for brevity
          },
        },
      };

      (service as any).get = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.getAddress(addressId);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).get).toHaveBeenCalledWith(`/addresses/${addressId}`);
    });
  });

  describe('getAddressTransactions', () => {
    it('should get transactions for an address', async () => {
      // Given
      const addressId = 'test-address-id';
      const mockResponse = {
        data: {
          statusCode: 200,
          message: 'Transactions fetched successfully',
          data: [
            {
              id: 'tx-123456',
              hash: '0x1234567890abcdef',
              amount: '100',
              token: {
                symbol: 'ETH',
                decimals: 18,
              },
              from: '0x1111111111111111111111111111111111111111',
              to: '0xe1037B45b48390285e5067424053fa35c478296b',
              status: 'CONFIRMED',
              network: 'testnet',
              blockNumber: 12345678,
              blockHash: '0x0987654321fedcba',
              createdAt: '2024-10-23T11:13:40.446Z',
              updatedAt: '2024-10-23T11:13:40.446Z',
            },
          ],
        },
      };

      (service as any).get = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.getAddressTransactions(addressId);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).get).toHaveBeenCalledWith(`/addresses/${addressId}/transactions`);
    });
  });

  describe('getTransaction', () => {
    it('should get a transaction by ID', async () => {
      // Given
      const transactionId = 'tx-123456';
      const mockResponse = {
        data: {
          statusCode: 200,
          message: 'Transaction fetched successfully',
          data: {
            id: transactionId,
            hash: '0x1234567890abcdef',
            amount: '100',
            token: {
              symbol: 'ETH',
              decimals: 18,
            },
            from: '0x1111111111111111111111111111111111111111',
            to: '0xe1037B45b48390285e5067424053fa35c478296b',
            status: 'CONFIRMED',
            network: 'testnet',
            blockNumber: 12345678,
            blockHash: '0x0987654321fedcba',
            createdAt: '2024-10-23T11:13:40.446Z',
            updatedAt: '2024-10-23T11:13:40.446Z',
          },
        },
      };

      (service as any).get = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.getTransaction(transactionId);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).get).toHaveBeenCalledWith(`/transactions/${transactionId}`);
    });
  });
  
  describe('getWalletAddresses', () => {
    it('should get all addresses for a wallet', async () => {
      // Given
      const walletId = 'test-wallet-id';
      const mockResponse = {
        data: {
          statusCode: 200,
          message: 'Addresses fetched successfully',
          data: [
            {
              address: '0xe1037B45b48390285e5067424053fa35c478296b',
              id: 'address-id-1',
              name: 'Business 1',
              isActive: true,
              // other fields omitted for brevity
            },
            {
              address: '0xabcdef1234567890abcdef1234567890abcdef12',
              id: 'address-id-2',
              name: 'Business 2',
              isActive: true,
              // other fields omitted for brevity
            },
          ],
        },
      };

      (service as any).get = jest.fn().mockResolvedValue(mockResponse.data);

      // When
      const result = await service.getWalletAddresses(walletId);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect((service as any).get).toHaveBeenCalledWith(`/wallets/${walletId}/addresses`);
    });
  });
}); 