import { supabase } from './supabase';

export const fetchOrders = async (filters?: { customerId?: string; merchantId?: string }) => {
  if (!supabase) return [];
  let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (filters?.customerId) query = query.eq('customer_id', filters.customerId);
  if (filters?.merchantId) query = query.eq('merchant_id', filters.merchantId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

export const createOrder = async (payload: Record<string, unknown>) => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('orders').insert(payload).select().single();
  if (error) throw error;
  return data;
};