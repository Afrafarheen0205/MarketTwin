import axiosClient from './axiosClient';

export interface DemandSpecification {
  name: string;
  value: string;
  unit?: string | null;
  mandatory?: boolean;
}

export interface DemandCreatePayload {
  product_name: string;
  category: string;
  description?: string | null;
  brand?: string | null;
  model_number?: string | null;
  technical_specifications?: DemandSpecification[];
  quantity: number;
  unit: string;
  minimum_target_unit_price: number;
  maximum_target_unit_price: number;
  currency?: string;
  required_delivery_date?: string | null;
  expected_lead_time?: number | null;
  delivery_address?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    instructions?: string | null;
  } | null;
  additional_requirements?: string | null;
  mandatory_requirements?: Record<string, string>;
  optional_preferences?: Record<string, string>;
}

export type DemandUpdatePayload = Partial<DemandCreatePayload>;

export interface DemandRecord {
  id: string;
  customer_id: string | null;
  demand_code?: string | null;
  product_name: string;
  category?: string | null;
  description?: string | null;
  brand?: string | null;
  model_number?: string | null;
  technical_specifications?: DemandSpecification[];
  dimensions?: Record<string, unknown>;
  additional_requirements?: string | null;
  quantity: number;
  unit?: string | null;
  minimum_target_unit_price?: number | null;
  maximum_target_unit_price?: number | null;
  currency?: string | null;
  required_delivery_date?: string | null;
  expected_lead_time?: number | null;
  delivery_address?: Record<string, unknown>;
  status?: string | null;
  created_at?: string | null;
}

export interface DemandListResponse {
  items: DemandRecord[];
  total: number;
  page: number;
  page_size: number;
}

export type DemandMatchClassification = 'all' | 'exact' | 'similar' | 'incompatible';

export interface DemandComparison {
  key: string;
  current_value?: string | null;
  other_value?: string | null;
  state: 'PASS' | 'FAIL' | 'UNKNOWN';
  reason: string;
}

export interface AnalyzedDemand {
  id: string;
  demand_code?: string | null;
  product_name?: string | null;
  category?: string | null;
  brand?: string | null;
  model_number?: string | null;
  technical_specifications?: DemandSpecification[];
  quantity?: number | null;
  unit?: string | null;
  minimum_target_unit_price?: number | null;
  maximum_target_unit_price?: number | null;
  currency?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface DemandAnalysisResult {
  classification: Exclude<DemandMatchClassification, 'all'>;
  demand: AnalyzedDemand;
  explanation: string;
  comparisons: DemandComparison[];
  differences: string[];
}

export interface DemandAnalysisResponse {
  current_demand: AnalyzedDemand;
  summary: {
    my_existing_demands_count: number;
    exact_match_count: number;
    similar_match_count: number;
    incompatible_match_count: number;
    distinct_exact_customers_count: number;
    distinct_similar_customers_count: number;
    compatible_demand_count: number;
    distinct_compatible_customers_count: number;
    merchant_opportunity_eligible: boolean;
    total_requested_quantity: number | null;
    total_requested_quantity_unit: string | null;
    aggregate_minimum_target_unit_price: number | null;
    aggregate_maximum_target_unit_price: number | null;
    aggregate_currency: string | null;
    common_mandatory_requirements: Array<{ name: string; value: string }>;
    important_differences: string[];
  };
  results: DemandAnalysisResult[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    classification: DemandMatchClassification;
  };
  generated_at: string;
}

export const demandApi = {
  createDemand: async (payload: DemandCreatePayload, idempotencyKey: string) => {
    const res = await axiosClient.post<DemandRecord>(
      '/api/v1/customer/demands',
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey } }
    );
    return res.data;
  },
  listDemands: async (params?: { page?: number; page_size?: number; status?: string; search?: string }) => {
    const res = await axiosClient.get<DemandListResponse>('/api/v1/customer/demands', { params });
    return res.data;
  },
  getDemand: async (id: string) => {
    const res = await axiosClient.get(`/api/v1/customer/demands/${id}`);
    return res.data;
  },
  analyzeDemand: async (
    id: string,
    params?: {
      page?: number;
      page_size?: number;
      classification?: DemandMatchClassification;
    }
  ) => {
    const res = await axiosClient.post<DemandAnalysisResponse>(
      `/api/v1/customer/demands/${encodeURIComponent(id)}/analyze`,
      null,
      { params }
    );
    return res.data;
  },
  updateDemand: async (id: string, payload: DemandUpdatePayload) => {
    const res = await axiosClient.put<DemandRecord>(
      `/api/v1/customer/demands/${id}`,
      payload
    );
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