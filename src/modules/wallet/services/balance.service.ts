import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TokenService, TokenData } from './token.service';
import { firstValueFrom } from 'rxjs';

/**
 * Interface for token balance data returned from the API
 */
export interface TokenBalance {
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
  balance: string;
  convertedBalance: string;
  blockchain: string;
  blockchainId: string;
  address: string;
}

/**
 * Service for handling wallet balances from BlockRadar API
 */
@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Get all token balances for a specific wallet address
   * 
   * @param walletId The BlockRadar wallet ID
   * @param addressId The address ID within the wallet
   * @returns Promise with all token balances
   */
  async getAllBalances(walletId: string, addressId: string): Promise<TokenBalance[]> {
    this.logger.debug(`Fetching all balances for wallet: ${walletId}, address: ${addressId}`);
    
    const apiKey = this.configService.get<string>('blockradar.apiKey');
    if (!apiKey) {
      this.logger.error('BlockRadar API key is not configured');
      throw new Error('BlockRadar API key is not configured');
    }

    const url = `https://api.blockradar.co/v1/wallets/${walletId}/addresses/${addressId}/balances`;
    
    try {
      this.logger.debug(`Calling ${url} to fetch balances`);
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { 'x-api-key': apiKey }
        })
      );
      
      if (!response.data || !response.data.data) {
        this.logger.error('Unexpected API response format');
        return [];
      }
      
      const balances = response.data.data;
      this.logger.debug(`Received ${balances.length} token balances from API`);
      
      // Map API response to our TokenBalance interface
      return balances
        .filter(balance => balance.asset?.asset && balance.asset.asset.blockchain)
        .map(balance => {
          const token = balance.asset.asset;
          const blockchain = token.blockchain;
          
          return {
            tokenId: token.id,
            tokenName: token.name,
            tokenSymbol: token.symbol,
            balance: balance.balance || '0',
            convertedBalance: balance.convertedBalance || '0',
            blockchain: blockchain.name,
            blockchainId: blockchain.id,
            address: token.address || 'Unknown'
          };
        });
    } catch (error) {
      this.logger.error(
        `Error fetching balances: ${error.message}`,
        error.stack
      );
      return [];
    }
  }

  /**
   * Get balances for specific tokens only
   * 
   * @param walletId The BlockRadar wallet ID
   * @param addressId The address ID within the wallet
   * @param tokenIds Array of token IDs to filter by
   * @returns Promise with filtered token balances
   */
  async getBalancesByTokenIds(
    walletId: string, 
    addressId: string, 
    tokenIds: string[]
  ): Promise<TokenBalance[]> {
    this.logger.debug(
      `Fetching balances for wallet: ${walletId}, address: ${addressId}, tokens: ${tokenIds.join(', ')}`
    );
    
    const allBalances = await this.getAllBalances(walletId, addressId);
    
    // Filter for the specific token IDs
    const filteredBalances = allBalances.filter(balance => 
      tokenIds.includes(balance.tokenId)
    );
    
    this.logger.debug(
      `Found ${filteredBalances.length} matching balances out of ${allBalances.length} total balances`
    );
    
    return filteredBalances;
  }

  /**
   * Get all supported platform token balances
   * 
   * @param walletId The BlockRadar wallet ID
   * @param addressId The address ID within the wallet
   * @returns Promise with balances for all supported platform tokens
   */
  async getSupportedTokenBalances(walletId: string, addressId: string): Promise<TokenBalance[]> {
    // Get all supported token IDs from the TokenService
    const supportedTokens = await this.tokenService.getSupportedPlatformTokens();
    const tokenIds = supportedTokens.map(token => token.tokenId);
    
    this.logger.debug(`Fetching balances for ${tokenIds.length} supported platform tokens`);
    
    return this.getBalancesByTokenIds(walletId, addressId, tokenIds);
  }

  /**
   * Get USDT on BNB Smart Chain balances
   * 
   * @param walletId The BlockRadar wallet ID
   * @param addressId The address ID within the wallet
   * @returns Promise with USDT on BNB Smart Chain balances
   */
  async getUsdtOnBscBalances(walletId: string, addressId: string): Promise<TokenBalance[]> {
    const usdtBscTokens = await this.tokenService.getUsdtOnBsc();
    const tokenIds = usdtBscTokens.map(token => token.tokenId);
    
    this.logger.debug(`Fetching balances for USDT on BNB Smart Chain (${tokenIds.join(', ')})`);
    
    return this.getBalancesByTokenIds(walletId, addressId, tokenIds);
  }

  /**
   * Get USDT on Tron blockchain balances
   * 
   * @param walletId The BlockRadar wallet ID
   * @param addressId The address ID within the wallet
   * @returns Promise with USDT on Tron balances
   */
  async getUsdtOnTronBalances(walletId: string, addressId: string): Promise<TokenBalance[]> {
    const usdtTronTokens = await this.tokenService.getUsdtOnTron();
    const tokenIds = usdtTronTokens.map(token => token.tokenId);
    
    this.logger.debug(`Fetching balances for USDT on Tron (${tokenIds.join(', ')})`);
    
    return this.getBalancesByTokenIds(walletId, addressId, tokenIds);
  }

  /**
   * Get USDC on Base blockchain balances
   * 
   * @param walletId The BlockRadar wallet ID
   * @param addressId The address ID within the wallet
   * @returns Promise with USDC on Base balances
   */
  async getUsdcOnBaseBalances(walletId: string, addressId: string): Promise<TokenBalance[]> {
    const usdcBaseTokens = await this.tokenService.getUsdcOnBase();
    const tokenIds = usdcBaseTokens.map(token => token.tokenId);
    
    this.logger.debug(`Fetching balances for USDC on Base (${tokenIds.join(', ')})`);
    
    return this.getBalancesByTokenIds(walletId, addressId, tokenIds);
  }

  /**
   * Helper method to get the first token balance from a list
   * Useful when we expect only one token of a specific type
   * 
   * @param balances Array of token balances
   * @returns The first balance or null if none exist
   */
  getFirstBalance(balances: TokenBalance[]): TokenBalance | null {
    return balances.length > 0 ? balances[0] : null;
  }
} 