import axios, { AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { env } from '../config/env';
import { supabase } from '../services/supabase';

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
  async (config: InternalAxiosRequestConfig) => {
    // Attach client request timestamp for latency debugging
    config.headers['X-Request-Timestamp'] = new Date().toISOString();

    // Attach active Supabase JWT bearer token if available
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          config.headers.Authorization = `Bearer ${data.session.access_token}`;
        }
      }
    } catch {
      // Fallback silently if session retrieval fails
    }

    if (
      import.meta.env.DEV &&
      config.method?.toLowerCase() === 'post' &&
      config.url === '/api/v1/customer/demands'
    ) {
      const authorization = String(config.headers.Authorization ?? '');
      const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
      if (bearerToken && globalThis.crypto?.subtle) {
        try {
          const digest = await globalThis.crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(bearerToken)
          );
          config.headers['X-Diagnostic-Token-Sha256'] = Array.from(
            new Uint8Array(digest),
            (byte) => byte.toString(16).padStart(2, '0')
          ).join('');
        } catch {
          // Diagnostics must not block demand submission.
        }
      }
    }

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
  (error: AxiosError<{ message?: string; detail?: string | { msg: string }[]; error?: string }>) => {
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
      } else if (data?.error) {
        friendlyMessage = data.error;
      } else {
        friendlyMessage = `Server error (${error.response.status}).`;
      }
    } else if (error.request) {
      const apiLocation = env.apiBaseUrl || 'the current frontend origin';
      friendlyMessage =
        `Unable to complete the API request via ${apiLocation}. ` +
        'Check network connectivity, the frontend API proxy, and backend CORS settings; ' +
        'a running backend may still be unreachable from this browser.';
    }

    const enhancedError = new Error(friendlyMessage);
    (enhancedError as unknown as { originalError: AxiosError }).originalError = error;
    (enhancedError as unknown as { status?: number }).status = error.response?.status;

    return Promise.reject(enhancedError);
  }
);

export default axiosClient;
