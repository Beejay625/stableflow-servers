import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { WalletConfigService } from "./wallet-config";

describe("WalletConfigService", () => {
  let service: WalletConfigService;
  let configService: ConfigService;

  beforeEach(async () => {
    // Mock config service
    const configServiceMock = {
      get: jest.fn((key) => {
        const config = {
          bep20usdt: {
            apiKey: "bep20usdt-api-key",
            walletId: "bep20usdt-wallet-id",
          },
          usdcbase: {
            apiKey: "usdcbase-api-key",
            walletId: "usdcbase-wallet-id",
          },
          tronusdt: {
            apiKey: "tronusdt-api-key",
            walletId: "tronusdt-wallet-id",
          },
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletConfigService,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<WalletConfigService>(WalletConfigService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getWalletConfig", () => {
    it("should return bep20usdt config for BNB Smart Chain USDT transactions", () => {
      const payload = {
        data: {
          blockchain: { name: "BNB smart chain" },
          asset: { symbol: "USDT" },
          wallet: { id: "test-wallet-id" },
        },
      };

      const result = service.getWalletConfig(payload);

      expect(result).not.toBeNull();
      expect(result?.walletName).toBe("bep20usdt");
      expect(result?.apiKey).toBe("bep20usdt-api-key");
      expect(result?.walletId).toBe("test-wallet-id"); // Prefer payload wallet ID
    });

    it("should return usdcbase config for Base USDC transactions", () => {
      const payload = {
        data: {
          blockchain: { name: "base" },
          asset: { symbol: "USDC" },
          wallet: { id: "test-wallet-id" },
        },
      };

      const result = service.getWalletConfig(payload);

      expect(result).not.toBeNull();
      expect(result?.walletName).toBe("usdcbase");
      expect(result?.apiKey).toBe("usdcbase-api-key");
      expect(result?.walletId).toBe("test-wallet-id");
    });

    it("should return null when no matching wallet is found", () => {
      const payload = {
        data: {
          blockchain: { name: "ethereum" },
          asset: { symbol: "ETH" },
          wallet: { id: "test-wallet-id" },
        },
      };

      const result = service.getWalletConfig(payload);

      expect(result).toBeNull();
    });

    it("should handle missing payload data gracefully", () => {
      const payload = {};

      const result = service.getWalletConfig(payload);

      expect(result).toBeNull();
    });
  });

  describe("getBlockchainName", () => {
    it("should return the full blockchain name from payload", () => {
      const payload = {
        data: {
          blockchain: { name: "BNB smart chain" },
        },
      };

      const result = service.getBlockchainName(payload);

      expect(result).toBe("BNB smart chain");
    });

    it("should fallback to network if blockchain name is missing", () => {
      const payload = {
        data: {
          network: "tron",
        },
      };

      const result = service.getBlockchainName(payload);

      expect(result).toBe("tron");
    });

    it("should return null if both blockchain name and network are missing", () => {
      const payload = {
        data: {},
      };

      const result = service.getBlockchainName(payload);

      expect(result).toBeNull();
    });
  });

  describe("getWalletConfigForTransaction", () => {
    it("should return bep20usdt config for BNB Smart Chain transaction data", () => {
      const transactionData = {
        blockchainName: "BNB smart chain",
        tokenSymbol: "USDT",
        walletId: "test-wallet-id",
      };

      const result = service.getWalletConfigForTransaction(transactionData);

      expect(result).not.toBeNull();
      expect(result?.walletName).toBe("bep20usdt");
      expect(result?.apiKey).toBe("bep20usdt-api-key");
      expect(result?.walletId).toBe("test-wallet-id");
    });

    it("should return usdcbase config for Base transaction data", () => {
      const transactionData = {
        blockchainName: "base",
        tokenSymbol: "USDC",
        walletId: "test-wallet-id",
      };

      const result = service.getWalletConfigForTransaction(transactionData);

      expect(result).not.toBeNull();
      expect(result?.walletName).toBe("usdcbase");
      expect(result?.apiKey).toBe("usdcbase-api-key");
      expect(result?.walletId).toBe("test-wallet-id");
    });

    it("should return null for unsupported blockchain/token combination", () => {
      const transactionData = {
        blockchainName: "ethereum",
        tokenSymbol: "ETH",
        walletId: "test-wallet-id",
      };

      const result = service.getWalletConfigForTransaction(transactionData);

      expect(result).toBeNull();
    });
  });
});
