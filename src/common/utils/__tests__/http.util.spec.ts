import { HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';
import { formatQueryParams, handleAxiosError, retryWithBackoff } from '../http.util';
import { HttpErrorException } from '../../exceptions';

describe('HTTP Utilities', () => {
  describe('formatQueryParams', () => {
    it('should format valid query parameters', () => {
      // Given
      const params = {
        name: 'test',
        age: 25,
        active: true
      };

      // When
      const result = formatQueryParams(params);

      // Then
      expect(result).toBe('name=test&age=25&active=true');
    });

    it('should exclude null and undefined values', () => {
      // Given
      const params = {
        name: 'test',
        age: null,
        status: undefined,
        active: true
      };

      // When
      const result = formatQueryParams(params);

      // Then
      expect(result).toBe('name=test&active=true');
    });

    it('should properly encode special characters', () => {
      // Given
      const params = {
        query: 'hello world',
        filter: 'status=active&type=user'
      };

      // When
      const result = formatQueryParams(params);

      // Then
      expect(result).toBe('query=hello%20world&filter=status%3Dactive%26type%3Duser');
    });
  });

  describe('handleAxiosError', () => {
    it('should transform axios error with response to HttpErrorException', () => {
      // Given
      const axiosError = {
        response: {
          status: HttpStatus.BAD_REQUEST,
          data: {
            message: 'Invalid input'
          }
        },
        config: {
          url: 'http://api.example.com',
          method: 'POST'
        }
      } as AxiosError;

      // When/Then
      expect(() => handleAxiosError(axiosError)).toThrow(HttpErrorException);
      try {
        handleAxiosError(axiosError);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpErrorException);
        expect(error.message).toBe('Invalid input');
        expect(error.status).toBe(HttpStatus.BAD_REQUEST);
        expect(error.code).toBe('HTTP_REQUEST_FAILED');
      }
    });

    it('should handle axios error without response', () => {
      // Given
      const axiosError = {
        request: {},
        config: {
          url: 'http://api.example.com'
        }
      } as AxiosError;

      // When/Then
      try {
        handleAxiosError(axiosError);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpErrorException);
        expect(error.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect(error.code).toBe('SERVICE_UNAVAILABLE');
      }
    });
  });

  describe('retryWithBackoff', () => {
    it('should retry failed operation and eventually succeed', async () => {
      // Given
      let attempts = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve('success');
      });

      // When
      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelay: 100
      });

      // Then
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max attempts', async () => {
      // Given
      const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      // When/Then
      await expect(
        retryWithBackoff(mockFn, {
          maxAttempts: 3,
          initialDelay: 100
        })
      ).rejects.toThrow('Persistent failure');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });
}); 