import axiosClient from './axiosClient';

export const demandApi = {
  createDemand: async (payload: any) => {
    const res = await axiosClient.post('/api/v1/customer/demands', payload);
    return res.data;
  },
  listDemands: async (params?: { page?: number; page_size?: number; status?: string; search?: string }) => {
    const res = await axiosClient.get('/api/v1/customer/demands', { params });
    return res.data;
  },
  getDemand: async (id: string) => {
    const res = await axiosClient.get(`/api/v1/customer/demands/${id}`);
    return res.data;
  },
  updateDemand: async (id: string, payload: any) => {
    const res = await axiosClient.put(`/api/v1/customer/demands/${id}`, payload);
    return res.data;
  },
  cancelDemand: async (id: string) => {
    const res = await axiosClient.post(`/api/v1/customer/demands/${id}/cancel`);
    return res.data;
  },
  uploadAttachment: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axiosClient.post(`/api/v1/customer/demands/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  getAttachments: async (id: string) => {
    const res = await axiosClient.get(`/api/v1/customer/demands/${id}/attachments`);
    return res.data;
  },
};

export default demandApi;