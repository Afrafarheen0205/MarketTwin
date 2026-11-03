import { supabase } from './supabase';

export interface ProductRecord {
  id: string;
  name: string;
  category: string;
  sku: string;
  description: string | null;
  market_price: number;
  min_demand_price: number | null;
  rating: number;
  reviews_count: number;
  in_stock: boolean;
  image_url: string | null;
  specs: Record<string, string>;
}

export const fetchProducts = async (): Promise<ProductRecord[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProductRecord[];
};

export const fetchCategories = async () => {
  if (!supabase) return [];
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) throw error;
  return data ?? [];
};