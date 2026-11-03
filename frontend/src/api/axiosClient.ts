import axios, { AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { env } from '../config/env';

/**
 * Configured Axios Client
 * Provides base URL configuration, request/response interceptors, and normalized error handling.
 */
export const axiosClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request Interceptor
axiosClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Attach client request timestamp for latency debugging
    config.headers['X-Request-Timestamp'] = new Date().toISOString();
    return config;
  },
  (error: AxiosError) => {
    console.error('[MarketTwin API Request Error]:', error);
    return Promise.reject(error);
  }
);

// Response Interceptor
axiosClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError<{ message?: string; detail?: string | { msg: string }[] }>) => {
    let friendlyMessage = 'An unexpected error occurred. Please try again.';

    if (error.response) {
      // Backend returned an error response
      const data = error.response.data;
      if (typeof data?.detail === 'string') {
        friendlyMessage = data.detail;
      } else if (Array.isArray(data?.detail) && data.detail.length > 0) {
        friendlyMessage = data.detail.map((err) => err.msg).join(', ');
      } else if (data?.message) {
        friendlyMessage = data.message;
      } else {
        friendlyMessage = `Server error (${error.response.status}).`;
      }
    } else if (error.request) {
      // Network error or backend server is not running
      friendlyMessage = `Cannot reach backend at ${env.apiBaseUrl}. Ensure the FastAPI server is running.`;
    }

    const enhancedError = new Error(friendlyMessage);
    (enhancedError as unknown as { originalError: AxiosError }).originalError = error;
    (enhancedError as unknown as { status?: number }).status = error.response?.status;

    return Promise.reject(enhancedError);
  }
);

export default axiosClient;
