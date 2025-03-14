import { Test, TestingModule } from '@nestjs/testing';
import { PaycrestApiService } from './paycrest-api.service';
import { BlockradarApiService } from './blockradar-api.service';
import axios from 'axios';
import { handleAxiosError, retryWithBackoff } from '../utils/http.util';
import { HttpStatus } from '@nestjs/common';
import { HttpErrorException } from '../exceptions';

jest.mock('axios');
jest.mock('../utils/http.util');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedHandleAxiosError = handleAxiosError as jest.MockedFunction<typeof handleAxiosError>;
const mockedRetryWithBackoff = retryWithBackoff as jest.MockedFunction<typeof retryWithBackoff>;

describe('External API Services', () => {
  let paycrestService: PaycrestApiService;
  let blockradarService: BlockradarApiService;
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
    } as any);

    mockedRetryWithBackoff.mockImplementation(fn => fn());
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PaycrestApiService,
          useFactory: () => new PaycrestApiService('https://api.paycrest.test/v1', 'test-paycrest-key'),
        },
        {
          provide: BlockradarApiService,
          useFactory: () => new BlockradarApiService('https://api.blockradar.co/v1', 'test-blockradar-key'),
        },
      ],
    }).compile();

    paycrestService = module.get<PaycrestApiService>(PaycrestApiService);
    blockradarService = module.get<BlockradarApiService>(BlockradarApiService);
  });

  it('should create both services', () => {
    expect(paycrestService).toBeDefined();
    expect(blockradarService).toBeDefined();
  });

  describe('API configuration', () => {
    it('should configure Paycrest API with correct headers', () => {
      // Check that axios.create was called with correct configuration
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.paycrest.test/v1',
          headers: expect.objectContaining({
            'API-Key': 'test-paycrest-key',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should configure Blockradar API with correct headers', () => {
      // Check that axios.create was called with correct configuration
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.blockradar.co/v1',
          headers: expect.objectContaining({
            'x-api-key': 'test-blockradar-key',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });
  });

  describe('Error handling', () => {
    it('should use retry mechanism for API calls', async () => {
      // Setup a mock implementation for a service method
      const mockAxiosInstance = {
        get: jest.fn().mockResolvedValue({ data: { message: 'success' } }),
      };
      
      (paycrestService as any).axios = mockAxiosInstance;
      
      // Call a method that uses retryWithBackoff
      await (paycrestService as any).get('/test');
      
      // Verify retryWithBackoff was called
      expect(mockedRetryWithBackoff).toHaveBeenCalled();
    });

    it('should handle API errors correctly', async () => {
      // Setup for error handling test
      const mockError = new Error('API Error');
      mockError.name = 'AxiosError';
      (mockError as any).response = {
        status: HttpStatus.BAD_REQUEST,
        data: { message: 'Bad request' },
      };
      
      mockedHandleAxiosError.mockImplementation(() => {
        throw new HttpErrorException('Bad request', HttpStatus.BAD_REQUEST, 'BAD_REQUEST');
      });
      
      const mockAxiosInstance = {
        get: jest.fn().mockRejectedValue(mockError),
      };
      
      (blockradarService as any).axios = mockAxiosInstance;
      
      // Call a method that will throw
      try {
        await (blockradarService as any).get('/test');
        fail('Should have thrown an error');
      } catch (error) {
        // Verify error handling
        expect(error).toBeInstanceOf(HttpErrorException);
        expect(mockedHandleAxiosError).toHaveBeenCalled();
      }
    });
  });
}); 