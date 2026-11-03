import axiosClient from './axiosClient';
import { HealthResponse } from '../types';

/**
 * Health API Client
 * Used to verify frontend-to-backend communication and backend service status.
 */
export const healthApi = {
  /**
   * Fetches health status from backend API v1
   */
  checkHealth: async (): Promise<HealthResponse> => {
    const response = await axiosClient.get<HealthResponse>('/api/v1/health');
    return response.data;
  },

  /**
   * Quick ping to root health endpoint
   */
  ping: async (): Promise<{ status: string }> => {
    const response = await axiosClient.get<{ status: string }>('/health');
    return response.data;
  },
};

export default healthApi;
