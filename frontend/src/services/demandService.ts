import { supabase } from './supabase';

export interface DemandRecord {
  id: string;
  demand_code: string;
  customer_id: string | null;
  title: string;
  category: string;
  target_price: number;
  market_price: number | null;
  target_quantity: number;
  current_group_quantity: number;
  group_threshold: number | null;
  status: string;
  description: string | null;
  specs: Record<string, string>;
  deadline: string | null;
  group_id: string | null;
  created_at: string;
}

export const fetchDemands = async (customerId?: string): Promise<DemandRecord[]> => {
  if (!supabase) return [];
  let query = supabase.from('demands').select('*').order('created_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DemandRecord[];
};

export const fetchDemandGroups = async () => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('demand_groups')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
};