import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { formatQueryParams, handleAxiosError, retryWithBackoff } from '../utils/http.util';

export abstract class BaseHttpService {
  protected readonly axios: AxiosInstance;
  protected readonly baseURL: string;

  constructor(baseURL: string, config?: AxiosRequestConfig) {
    this.baseURL = baseURL;
    this.axios = axios.create({
      baseURL,
      ...config,
    });
  }

  protected async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    try {
      const queryString = params ? `?${formatQueryParams(params)}` : '';
      const response = await retryWithBackoff(
        () => this.axios.get<T>(`${path}${queryString}`),
        { maxAttempts: 3, initialDelay: 1000 }
      );
      return response.data;
    } catch (error) {
      handleAxiosError(error);
    }
  }

  protected async post<T>(path: string, data: any): Promise<T> {
    try {
      const response = await retryWithBackoff(
        () => this.axios.post<T>(path, data),
        { maxAttempts: 3, initialDelay: 1000 }
      );
      return response.data;
    } catch (error) {
      handleAxiosError(error);
    }
  }

  protected async put<T>(path: string, data: any): Promise<T> {
    try {
      const response = await retryWithBackoff(
        () => this.axios.put<T>(path, data),
        { maxAttempts: 3, initialDelay: 1000 }
      );
      return response.data;
    } catch (error) {
      handleAxiosError(error);
    }
  }

  protected async delete<T>(path: string): Promise<T> {
    try {
      const response = await retryWithBackoff(
        () => this.axios.delete<T>(path),
        { maxAttempts: 3, initialDelay: 1000 }
      );
      return response.data;
    } catch (error) {
      handleAxiosError(error);
    }
  }
} 