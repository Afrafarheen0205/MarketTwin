import axiosClient from '../api/axiosClient';
import { supabase } from './supabase';

/**
 * Demands a merchant may still quote. Keep this in sync with the
 * demands_merchant_select_active policy in migration 025.
 */
export const ACTIVE_DEMAND_STATUSES = [
  'Pending',
  'Submitted',
  'Under Review',
  'Grouped',
  'Bidding Open',
  'Offers Available',
  'Offers Received',
  'Approved',
] as const;

export type ActiveDemandStatus = (typeof ACTIVE_DEMAND_STATUSES)[number];

export interface DemandSpecification {
  name: string;
  value: string;
  unit?: string | null;
  mandatory?: boolean;
}

export interface NormalizedRequirement {
  name: string;
  value: string;
}

export interface NormalizedDemandRequirements {
  product_type?: string | null;
  normalized_product_name?: string | null;
  normalized_category?: string | null;
  normalized_material?: string | null;
  normalized_specifications?: Record<string, string> | null;
  normalized_dimensions?: Record<string, string> | null;
  mandatory_requirements?: NormalizedRequirement[] | null;
  optional_preferences?: NormalizedRequirement[] | null;
  commercial_constraints?: Record<string, string | number | null> | null;
  delivery_constraints?: Record<string, string | number | null> | null;
  status?: string | null;
}

export interface ActiveDemand {
  id: string;
  customer_id: string | null;
  demand_code: string;
  title: string;
  category: string;
  description: string | null;
  brand: string | null;
  model_number: string | null;
  technical_specifications: DemandSpecification[] | null;
  dimensions: Record<string, string> | null;
  certifications: unknown[] | null;
  target_quantity: number | string | null;
  unit: string | null;
  min_target_unit_price: number | string | null;
  max_target_unit_price: number | string | null;
  target_price: number | string | null;
  market_price: number | string | null;
  currency: string | null;
  expected_lead_time: number | null;
  required_delivery_time: string | null;
  delivery_address: Record<string, string | null> | null;
  additional_requirements: string | null;
  custom_requirements: string | null;
  status: string;
  group_id: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string | null;
  normalized_requirements: NormalizedDemandRequirements | null;
}

const DEMAND_SELECT = [
  'id',
  'customer_id',
  'demand_code',
  'title',
  'category',
  'description',
  'brand',
  'model_number',
  'technical_specifications',
  'dimensions',
  'certifications',
  'target_quantity',
  'unit',
  'min_target_unit_price',
  'max_target_unit_price',
  'target_price',
  'market_price',
  'currency',
  'expected_lead_time',
  'required_delivery_time',
  'delivery_address',
  'additional_requirements',
  'custom_requirements',
  'status',
  'group_id',
  'deadline',
  'created_at',
  'updated_at',
  'demand_normalized_requirements(product_type,normalized_product_name,normalized_category,normalized_material,normalized_specifications,normalized_dimensions,mandatory_requirements,optional_preferences,commercial_constraints,delivery_constraints,status)',
].join(',');

const normalizeRow = (row: Record<string, any>): ActiveDemand => {
  const nested = row.demand_normalized_requirements;
  const normalized = Array.isArray(nested) ? nested[0] ?? null : nested ?? null;
  return {
    ...row,
    normalized_requirements: normalized,
  } as ActiveDemand;
};

const fromApi = async (): Promise<ActiveDemand[]> => {
  const { data } = await axiosClient.get<{ items: ActiveDemand[] }>('/api/v1/merchant/demands');
  return data.items ?? [];
};

const demandFromApi = async (demandId: string): Promise<ActiveDemand | null> => {
  try {
    const { data } = await axiosClient.get<{ demand: ActiveDemand }>(
      `/api/v1/merchant/demands/${demandId}`,
    );
    return data.demand ?? null;
  } catch {
    return null;
  }
};

/**
 * Read active customer demands straight from Supabase under RLS.
 *
 * The backend service-role endpoint is only used as a safety net when the
 * merchant policy is not deployed yet or Realtime/PostgREST rejects the read,
 * so a misconfigured policy never presents a false "0 demands" screen.
 */
export const fetchActiveDemands = async (): Promise<ActiveDemand[]> => {
  if (!supabase) return fromApi();
  const { data, error } = await supabase
    .from('demands')
    .select(DEMAND_SELECT)
    .in('status', [...ACTIVE_DEMAND_STATUSES])
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[MarketTwin] Direct merchant demand query failed, using API fallback.', error.message);
    return fromApi();
  }

  const rows = (data ?? []).map(normalizeRow);
  if (rows.length > 0) return rows;

  try {
    const apiRows = await fromApi();
    if (apiRows.length > 0) return apiRows;
  } catch {
    // The API fallback is best effort; an empty result is still valid.
  }
  return rows;
};

export const fetchActiveDemand = async (demandId: string): Promise<ActiveDemand | null> => {
  if (supabase) {
    const { data, error } = await supabase
      .from('demands')
      .select(DEMAND_SELECT)
      .eq('id', demandId)
      .limit(1)
      .maybeSingle();
    if (!error && data) return normalizeRow(data as Record<string, any>);
    if (error) {
      console.warn('[MarketTwin] Direct merchant demand detail failed, using API fallback.', error.message);
    }
  }
  return demandFromApi(demandId);
};

type DemandChangeHandler = () => void;

/**
 * Subscribe to demand changes for the merchant list. Supabase Realtime
 * enforces the same SELECT policy, so migration 025 must be applied for events
 * to arrive. Callers should also keep a light polling/focus refresh as a
 * safety net.
 */
export const subscribeToDemandChanges = (onChange: DemandChangeHandler): (() => void) => {
  const client = supabase;
  if (!client) return () => undefined;
  const channel = client
    .channel('merchant-active-demands')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'demands' },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
};
