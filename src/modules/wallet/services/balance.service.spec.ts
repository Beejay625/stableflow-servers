import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { BalanceService } from './balance.service';
import { TokenService } from './token.service';
import { of } from 'rxjs';

describe('BalanceService', () => {
  let service: BalanceService;
  let tokenService: TokenService;
  let httpService: HttpService;
  let configService: ConfigService;

  beforeEach(async () => {
    // Mock token service
    const tokenServiceMock = {
      getSupportedPlatformTokens: jest.fn().mockResolvedValue([
        { tokenId: 'token1', tokenSymbol: 'USDT', blockchainName: 'BNB smart chain' },
        { tokenId: 'token2', tokenSymbol: 'USDT', blockchainName: 'tron' },
        { tokenId: 'token3', tokenSymbol: 'USDC', blockchainName: 'base' },
      ]),
      getUsdtOnBsc: jest.fn().mockResolvedValue([
        { tokenId: 'token1', tokenSymbol: 'USDT', blockchainName: 'BNB smart chain' },
      ]),
      getUsdtOnTron: jest.fn().mockResolvedValue([
        { tokenId: 'token2', tokenSymbol: 'USDT', blockchainName: 'tron' },
      ]),
      getUsdcOnBase: jest.fn().mockResolvedValue([
        { tokenId: 'token3', tokenSymbol: 'USDC', blockchainName: 'base' },
      ]),
    };

    // Mock HTTP service
    const httpServiceMock = {
      get: jest.fn(),
    };

    // Mock config service
    const configServiceMock = {
      get: jest.fn().mockReturnValue('test-api-key'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceService,
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: HttpService, useValue: httpServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<BalanceService>(BalanceService);
    tokenService = module.get<TokenService>(TokenService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllBalances', () => {
    it('should retrieve all balances for a wallet address', async () => {
      // Mock API response
      const mockResponse = {
        data: {
          data: [
            {
              asset: {
                asset: {
                  id: 'token1',
                  name: 'Tether USD',
                  symbol: 'USDT',
                  blockchain: {
                    id: 'blockchain1',
                    name: 'BNB smart chain',
                  },
                  address: '0x123',
                },
              },
              balance: '100.0',
              convertedBalance: '100.0',
            },
            {
              asset: {
                asset: {
                  id: 'token2',
                  name: 'Tether USD',
                  symbol: 'USDT',
                  blockchain: {
                    id: 'blockchain2',
                    name: 'tron',
                  },
                  address: 'T123',
                },
              },
              balance: '50.0',
              convertedBalance: '50.0',
            },
          ],
        },
      };

      (httpService.get as jest.Mock).mockReturnValue(of(mockResponse));

      const result = await service.getAllBalances('wallet1', 'address1');

      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.blockradar.co/v1/wallets/wallet1/addresses/address1/balances',
        { headers: { 'x-api-key': 'test-api-key' } },
      );

      expect(result).toHaveLength(2);
      expect(result[0].tokenId).toBe('token1');
      expect(result[0].balance).toBe('100.0');
      expect(result[1].tokenId).toBe('token2');
      expect(result[1].balance).toBe('50.0');
    });
  });

  describe('getSupportedTokenBalances', () => {
    it('should retrieve balances for supported tokens', async () => {
      // Mock getAllBalances to return sample data
      jest.spyOn(service, 'getAllBalances').mockResolvedValue([
        {
          tokenId: 'token1',
          tokenName: 'Tether USD',
          tokenSymbol: 'USDT',
          balance: '100.0',
          convertedBalance: '100.0',
          blockchain: 'BNB smart chain',
          blockchainId: 'blockchain1',
          address: '0x123',
        },
        {
          tokenId: 'token2',
          tokenName: 'Tether USD',
          tokenSymbol: 'USDT',
          balance: '50.0',
          convertedBalance: '50.0',
          blockchain: 'tron',
          blockchainId: 'blockchain2',
          address: 'T123',
        },
        {
          tokenId: 'token4',
          tokenName: 'Bitcoin',
          tokenSymbol: 'BTC',
          balance: '1.0',
          convertedBalance: '50000.0',
          blockchain: 'Bitcoin',
          blockchainId: 'blockchain3',
          address: 'bc1',
        },
      ]);

      const result = await service.getSupportedTokenBalances('wallet1', 'address1');

      expect(tokenService.getSupportedPlatformTokens).toHaveBeenCalled();
      expect(result).toHaveLength(2); // Only USDT on BNB and USDT on Tron should be returned
      expect(result[0].tokenId).toBe('token1');
      expect(result[1].tokenId).toBe('token2');
    });
  });

  describe('getUsdtOnBscBalances', () => {
    it('should retrieve USDT on BSC balances', async () => {
      // Mock getAllBalances to return sample data
      jest.spyOn(service, 'getAllBalances').mockResolvedValue([
        {
          tokenId: 'token1',
          tokenName: 'Tether USD',
          tokenSymbol: 'USDT',
          balance: '100.0',
          convertedBalance: '100.0',
          blockchain: 'BNB smart chain',
          blockchainId: 'blockchain1',
          address: '0x123',
        },
        {
          tokenId: 'token2',
          tokenName: 'Tether USD',
          tokenSymbol: 'USDT',
          balance: '50.0',
          convertedBalance: '50.0',
          blockchain: 'tron',
          blockchainId: 'blockchain2',
          address: 'T123',
        },
      ]);

      const result = await service.getUsdtOnBscBalances('wallet1', 'address1');

      expect(tokenService.getUsdtOnBsc).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].tokenId).toBe('token1');
      expect(result[0].blockchain).toBe('BNB smart chain');
    });
  });

  // Additional tests for other methods
  describe('getUsdtOnTronBalances', () => {
    it('should retrieve USDT on Tron balances', async () => {
      jest.spyOn(service, 'getAllBalances').mockResolvedValue([
        {
          tokenId: 'token2',
          tokenName: 'Tether USD',
          tokenSymbol: 'USDT',
          balance: '50.0',
          convertedBalance: '50.0',
          blockchain: 'tron',
          blockchainId: 'blockchain2',
          address: 'T123',
        },
      ]);

      const result = await service.getUsdtOnTronBalances('wallet1', 'address1');
      
      expect(tokenService.getUsdtOnTron).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].tokenId).toBe('token2');
      expect(result[0].blockchain).toBe('tron');
    });
  });

  describe('getUsdcOnBaseBalances', () => {
    it('should retrieve USDC on Base balances', async () => {
      jest.spyOn(service, 'getAllBalances').mockResolvedValue([
        {
          tokenId: 'token3',
          tokenName: 'USD Coin',
          tokenSymbol: 'USDC',
          balance: '75.0',
          convertedBalance: '75.0',
          blockchain: 'base',
          blockchainId: 'blockchain3',
          address: '0xbase123',
        },
      ]);

      const result = await service.getUsdcOnBaseBalances('wallet1', 'address1');
      
      expect(tokenService.getUsdcOnBase).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].tokenId).toBe('token3');
      expect(result[0].blockchain).toBe('base');
    });
  });

  describe('getFirstBalance', () => {
    it('should return the first balance if available', () => {
      const balances = [
        {
          tokenId: 'token1',
          tokenName: 'Tether USD',
          tokenSymbol: 'USDT',
          balance: '100.0',
          convertedBalance: '100.0',
          blockchain: 'BNB smart chain',
          blockchainId: 'blockchain1',
          address: '0x123',
        },
      ];

      const result = service.getFirstBalance(balances);
      expect(result).toBeDefined();
      expect(result?.tokenId).toBe('token1');
    });

    it('should return null if no balances available', () => {
      const result = service.getFirstBalance([]);
      expect(result).toBeNull();
    });
  });
}); 