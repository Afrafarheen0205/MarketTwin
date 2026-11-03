import { supabase } from './supabase';

export const fetchOffers = async (filters?: { merchantId?: string; demandId?: string }) => {
  if (!supabase) return [];
  let query = supabase.from('merchant_offers').select('*').order('created_at', { ascending: false });
  if (filters?.merchantId) query = query.eq('merchant_id', filters.merchantId);
  if (filters?.demandId) query = query.eq('demand_id', filters.demandId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

export const createOffer = async (payload: Record<string, unknown>) => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('merchant_offers').insert(payload).select().single();
  if (error) throw error;
  return data;
};