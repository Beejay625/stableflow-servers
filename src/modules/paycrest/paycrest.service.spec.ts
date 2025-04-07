import { Test, TestingModule } from "@nestjs/testing";
import { PaycrestService } from "./paycrest.service";
import { ConfigService } from "@nestjs/config";
import { HttpModule, HttpService } from "@nestjs/axios";
import { AxiosResponse } from "axios";
import { of } from "rxjs";
import { API_PATHS } from "./constants";
import { Institution } from "./interfaces";

describe("PaycrestService", () => {
  let service: PaycrestService;
  let configService: ConfigService;
  let httpService: HttpService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key) => {
      if (key === "PAYCREST_API_KEY")
        return "208a4aef-1320-4222-82b4-e3bca8781b4b";
      if (key === "PAYCREST_API_URL") return "https://api.paycrest.io";
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
    httpService = module.get<HttpService>(HttpService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("constructor", () => {
    it("should set headers with API key from config", () => {
      expect(mockConfigService.get).toHaveBeenCalledWith("PAYCREST_API_KEY");
      expect((service as any).headers).toHaveProperty(
        "Authorization",
        "Bearer 208a4aef-1320-4222-82b4-e3bca8781b4b",
      );
      expect((service as any).headers).toHaveProperty(
        "Content-Type",
        "application/json",
      );
    });

    it("should throw error if API key is not configured", () => {
      mockConfigService.get.mockReturnValueOnce(undefined);
      expect(() => new PaycrestService(configService, httpService)).toThrow(
        "PAYCREST_API_KEY is not configured",
      );
    });
  });

  describe("getInstitutions", () => {
    it("should return institutions for a specific currency", async () => {
      // Given
      const currencyCode = "NGN";
      const mockInstitutions: Institution[] = [
        { name: "First Bank", code: "FBNINGLA", type: "bank" },
        { name: "GT Bank", code: "GTBINGLA", type: "bank" },
      ];

      const mockResponse: AxiosResponse = {
        data: {
          message: "Institutions fetched successfully",
          status: "success",
          data: mockInstitutions,
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, "get").mockReturnValueOnce(of(mockResponse));

      // When
      const result = await service.getInstitutions(currencyCode);

      // Then
      expect(result).toEqual(
        mockInstitutions.map((institution) => ({
          ...institution,
          supportedCurrencies: [currencyCode],
        })),
      );
      expect(httpService.get).toHaveBeenCalledWith(
        `${API_PATHS.INSTITUTIONS}/${currencyCode}`,
        expect.any(Object),
      );
    });

    it("should return empty array when no institutions found", async () => {
      // Given
      const currencyCode = "NGN";
      const mockResponse: AxiosResponse = {
        data: {
          message: "No institutions found",
          status: "success",
          data: null,
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, "get").mockReturnValueOnce(of(mockResponse));

      // When
      const result = await service.getInstitutions(currencyCode);

      // Then
      expect(result).toEqual([]);
    });

    it("should default to NGN when no currency code provided", async () => {
      // Given
      const mockInstitutions: Institution[] = [
        { name: "First Bank", code: "FBNINGLA", type: "bank" },
      ];

      const mockResponse: AxiosResponse = {
        data: {
          message: "Institutions fetched successfully",
          status: "success",
          data: mockInstitutions,
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, "get").mockReturnValueOnce(of(mockResponse));

      // When
      const result = await service.getInstitutions();

      // Then
      expect(httpService.get).toHaveBeenCalledWith(
        `${API_PATHS.INSTITUTIONS}/NGN`,
        expect.any(Object),
      );
      expect(result).toEqual(
        mockInstitutions.map((institution) => ({
          ...institution,
          supportedCurrencies: ["NGN"],
        })),
      );
    });
  });

  describe("getExchangeRate", () => {
    it("should return exchange rate information", async () => {
      // Given
      const exchangeRateRequest = {
        sourceCurrency: "NGN",
        targetCurrency: "USD",
        amount: "1000",
      };

      const mockResponse: AxiosResponse = {
        data: {
          message: "Exchange rate fetched successfully",
          status: "success",
          data: {
            rate: 0.0024,
            amount: 2.4,
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, "post").mockReturnValueOnce(of(mockResponse));

      // When
      const result = await service.getExchangeRate(exchangeRateRequest);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        API_PATHS.EXCHANGE_RATE,
        exchangeRateRequest,
        expect.any(Object),
      );
    });
  });

  describe("getTokenRate", () => {
    it("should return token rate information", async () => {
      // Given
      const token = "USDT";
      const amount = "1000";
      const fiat = "NGN";

      const mockResponse: AxiosResponse = {
        data: {
          message: "Token rate fetched successfully",
          status: "success",
          data: {
            rate: 750,
            amount: 750000,
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, "get").mockReturnValueOnce(of(mockResponse));

      // When
      const result = await service.getTokenRate(token, amount, fiat);

      // Then
      expect(result).toEqual(mockResponse.data);
      expect(httpService.get).toHaveBeenCalledWith(
        `${API_PATHS.TOKEN_RATE}/${token}/${amount}/${fiat}`,
        expect.any(Object),
      );
    });

    it("should include provider ID in URL when provided", async () => {
      // Given
      const token = "USDT";
      const amount = "1000";
      const fiat = "NGN";
      const providerId = "binance";

      const mockResponse: AxiosResponse = {
        data: {
          message: "Token rate fetched successfully",
          status: "success",
          data: {
            rate: 750,
            amount: 750000,
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      jest.spyOn(httpService, "get").mockReturnValueOnce(of(mockResponse));

      // When
      const result = await service.getTokenRate(
        token,
        amount,
        fiat,
        providerId,
      );

      // Then
      expect(result).toEqual(mockResponse.data);
      expect(httpService.get).toHaveBeenCalledWith(
        `${API_PATHS.TOKEN_RATE}/${token}/${amount}/${fiat}/${providerId}`,
        expect.any(Object),
      );
    });
  });
});
