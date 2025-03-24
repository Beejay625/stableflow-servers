import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Interface representing token data from BlockRadar API
 */
export interface TokenData {
  tokenId: string;
  tokenName: string;
  tokenSymbol: string;
  blockchainId: string;
  blockchainName: string;
  network: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly defaultNetwork: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Read default network from environment configuration
    this.defaultNetwork = this.configService.get<string>('blockradar.network');
    this.logger.log(`TokenService initialized with default network: ${this.defaultNetwork}`);
  }

  /**
   * Fetch stablecoin token details from BlockRadar API
   * Filters for tokens on specific blockchains and networks
   * 
   * @param networks Optional array of networks to filter by (e.g., 'mainnet', 'testnet')
   * @param symbols Optional array of token symbols to filter by (e.g., 'USDT', 'USDC')
   * @param blockchains Optional array of blockchain names to filter by (e.g., 'tron', 'base')
   * @returns Promise with array of token data
   */
  async getStablecoinTokens(
    networks?: string[],
    symbols?: string[],
    blockchains?: string[]
  ): Promise<TokenData[]> {
    const apiKey = this.configService.get<string>('blockradar.apiKey');

    if (!apiKey) {
      this.logger.error('BlockRadar API key is not configured');
      throw new Error('BlockRadar API key is not configured');
    }

    const url = 'https://api.blockradar.co/v1/assets';

    try {
      this.logger.debug(`Fetching token details from ${url}`);
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { 'x-api-key': apiKey },
        })
      );

      if (!response.data || !response.data.data) {
        this.logger.error('Unexpected API response format from BlockRadar');
        return [];
      }

      const tokens = response.data.data;
      this.logger.debug(`Received ${tokens.length} tokens from BlockRadar API`);

      // Use default network if none provided
      const effectiveNetworks = networks && networks.length > 0 
        ? networks 
        : [this.defaultNetwork];

      // Filter for tokens on supported blockchains
      const filteredTokens = tokens.filter((token: any) => {
        // Check if blockchain name matches any of our target blockchains (case insensitive)
        const blockchainMatches = token.blockchain?.name && (
          !blockchains || blockchains.length === 0 ? 
            (token.blockchain.name.toLowerCase().includes('bnb') || 
             token.blockchain.name.toLowerCase().includes('tron') || 
             token.blockchain.name.toLowerCase() === 'base') :
            blockchains.some(b => 
              token.blockchain.name.toLowerCase().includes(b.toLowerCase())
            )
        );
          
        // Check if network matches the requested networks
        const networkMatches = token.network && effectiveNetworks.includes(token.network);
          
        // Check if token symbol matches any of the requested symbols, if specified
        const symbolMatches = !symbols || symbols.length === 0 || 
          (token.symbol && symbols.includes(token.symbol.toUpperCase()));
          
        return blockchainMatches && networkMatches && symbolMatches;
      });

      // Log with details about the filters applied
      const networkFilterText = effectiveNetworks.join(', ') + ' networks';
      
      const symbolFilterText = symbols && symbols.length > 0 
        ? symbols.join(', ') + ' tokens' 
        : 'all supported stablecoins';
        
      const blockchainFilterText = blockchains && blockchains.length > 0
        ? blockchains.join(', ') + ' blockchains'
        : 'supported blockchains';
        
      this.logger.debug(`Filtered to ${filteredTokens.length} tokens (${symbolFilterText} on ${blockchainFilterText} for ${networkFilterText})`);

      return filteredTokens.map((token: any) => ({
        tokenId: token.id,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        blockchainId: token.blockchain?.id,
        blockchainName: token.blockchain?.name,
        network: token.network,
      }));
    } catch (error) {
      this.logger.error(
        `Error fetching token details: ${error.message}`,
        error.stack
      );
      return [];
    }
  }

  /**
   * Get default network stablecoin tokens based on NETWORK env variable
   * 
   * @param symbols Optional array of token symbols to filter by (e.g., 'USDT', 'USDC')
   * @returns Promise with array of token data for the default network
   */
  async getDefaultNetworkTokens(symbols?: string[]): Promise<TokenData[]> {
    return this.getStablecoinTokens([this.defaultNetwork], symbols);
  }

  /**
   * Get mainnet stablecoin tokens only
   * 
   * @param symbols Optional array of token symbols to filter by (e.g., 'USDT', 'USDC')
   * @returns Promise with array of mainnet token data
   */
  async getMainnetStablecoinTokens(symbols?: string[]): Promise<TokenData[]> {
    return this.getStablecoinTokens(['mainnet'], symbols);
  }

  /**
   * Get testnet stablecoin tokens only
   * 
   * @param symbols Optional array of token symbols to filter by (e.g., 'USDT', 'USDC')
   * @returns Promise with array of testnet token data
   */
  async getTestnetStablecoinTokens(symbols?: string[]): Promise<TokenData[]> {
    return this.getStablecoinTokens(['testnet'], symbols);
  }

  /**
   * Get USDT tokens only (using the default network from env)
   * 
   * @param networks Optional array of networks to override default
   * @returns Promise with array of USDT token data
   */
  async getUSDTTokens(networks?: string[]): Promise<TokenData[]> {
    return this.getStablecoinTokens(networks, ['USDT']);
  }

  /**
   * Get USDC tokens only (using the default network from env)
   * 
   * @param networks Optional array of networks to override default
   * @returns Promise with array of USDC token data
   */
  async getUSDCTokens(networks?: string[]): Promise<TokenData[]> {
    return this.getStablecoinTokens(networks, ['USDC']);
  }

  /**
   * Get USDT on Tron blockchain only (using the default network from env)
   * 
   * @param networks Optional array of networks to override default
   * @returns Promise with array of USDT tokens on Tron
   */
  async getUsdtOnTron(networks?: string[]): Promise<TokenData[]> {
    return this.getStablecoinTokens(networks, ['USDT'], ['tron']);
  }

  /**
   * Get USDC on Base blockchain only (using the default network from env)
   * 
   * @param networks Optional array of networks to override default
   * @returns Promise with array of USDC tokens on Base
   */
  async getUsdcOnBase(networks?: string[]): Promise<TokenData[]> {
    return this.getStablecoinTokens(networks, ['USDC'], ['base']);
  }

  /**
   * Get USDT on BNB Smart Chain only (using the default network from env)
   * 
   * @param networks Optional array of networks to override default
   * @returns Promise with array of USDT tokens on BNB Smart Chain
   */
  async getUsdtOnBsc(networks?: string[]): Promise<TokenData[]> {
    return this.getStablecoinTokens(networks, ['USDT'], ['bnb']);
  }

  /**
   * Get all supported platform tokens (USDT on Tron, USDC on Base, USDT on BSC)
   * using the default network from env
   * 
   * @param networks Optional array of networks to override default
   * @returns Promise with array of all supported platform tokens
   */
  async getSupportedPlatformTokens(networks?: string[]): Promise<TokenData[]> {
    const effectiveNetworks = networks || [this.defaultNetwork];
    
    const [usdtTron, usdcBase, usdtBsc] = await Promise.all([
      this.getUsdtOnTron(effectiveNetworks),
      this.getUsdcOnBase(effectiveNetworks),
      this.getUsdtOnBsc(effectiveNetworks)
    ]);
    
    return [...usdtTron, ...usdcBase, ...usdtBsc];
  }
} 