import { axiosClient } from './axiosClient';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  brand: string;
  model_number: string;
  specifications: Record<string, any>;
  unit: string;
  retail_price: number;
  wholesale_price: number;
  minimum_order_quantity: number;
  available_quantity: number;
  images: string[];
  status: 'active' | 'inactive';
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  // Compatibility aliases
  market_price?: number;
  min_demand_price?: number;
  in_stock?: boolean;
  image_url?: string;
  sku?: string;
  rating?: number;
  reviews_count?: number;
  activeDemandsCount?: number;
}

export interface ProductMatchItem extends Product {
  match_type: 'exact' | 'similar';
  relevance_score: number;
  match_reasons: string[];
}

export interface ProductQueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  sort_by?: 'newest' | 'price_asc' | 'price_desc' | 'popular';
}

export interface ProductSearchParams {
  q?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest';
  page?: number;
  page_size?: number;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ProductSearchResponse {
  items: ProductMatchItem[];
  exact_matches: ProductMatchItem[];
  similar_matches: ProductMatchItem[];
  total: number;
  exact_count: number;
  similar_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  query: string;
  has_exact_match: boolean;
  suggestion_message?: string | null;
}

export interface ProductMatchRequest {
  query?: string;
  category?: string;
  specifications?: Record<string, any>;
  target_price?: number;
  target_quantity?: number;
}

export interface ProductMatchResponse {
  matches: ProductMatchItem[];
  has_exact_match: boolean;
  exact_match_count: number;
  similar_match_count: number;
  recommendation: 'use_catalog' | 'create_demand';
  create_demand_params: Record<string, any>;
}

export interface CreateProductPayload {
  name: string;
  slug?: string;
  description?: string;
  category: string;
  brand?: string;
  model_number?: string;
  specifications?: Record<string, any>;
  unit?: string;
  retail_price: number;
  wholesale_price: number;
  minimum_order_quantity?: number;
  available_quantity?: number;
  images?: string[];
  status?: 'active' | 'inactive';
}

export const productApi = {
  /**
   * Fetch active catalog products with pagination, search, category filter, price bounds and sorting
   */
  async getProducts(params?: ProductQueryParams): Promise<ProductListResponse> {
    const res = await axiosClient.get<ProductListResponse>('/api/products', { params });
    return res.data;
  },

  /**
   * Phase 6 Core Search: Search products with relevance ranking, exact vs similar classification, and match explanations
   */
  async searchProducts(params?: ProductSearchParams): Promise<ProductSearchResponse> {
    const res = await axiosClient.get<ProductSearchResponse>('/api/products/search', { params });
    return res.data;
  },

  /**
   * Phase 6 Matching: Match customer requirement parameters or specs against existing catalogue
   */
  async matchProduct(payload: ProductMatchRequest): Promise<ProductMatchResponse> {
    const res = await axiosClient.post<ProductMatchResponse>('/api/products/match', payload);
    return res.data;
  },

  /**
   * Fetch distinct active product taxonomy categories
   */
  async getCategories(): Promise<string[]> {
    const res = await axiosClient.get<string[]>('/api/products/categories');
    return res.data;
  },

  /**
   * Fetch single product details by UUID or unique slug
   */
  async getProductById(idOrSlug: string): Promise<Product> {
    const res = await axiosClient.get<Product>(`/api/products/${idOrSlug}`);
    return res.data;
  },

  /**
   * Admin: List full catalog inventory including active and inactive items
   */
  async adminListProducts(params?: ProductQueryParams): Promise<ProductListResponse> {
    const res = await axiosClient.get<ProductListResponse>('/api/admin/products', { params });
    return res.data;
  },

  /**
   * Admin: Create a new product in the verified marketplace catalogue
   */
  async adminCreateProduct(payload: CreateProductPayload): Promise<Product> {
    const res = await axiosClient.post<Product>('/api/admin/products', payload);
    return res.data;
  },

  /**
   * Admin: Update product specifications, pricing, stock or status
   */
  async adminUpdateProduct(id: string, payload: Partial<CreateProductPayload>): Promise<Product> {
    const res = await axiosClient.put<Product>(`/api/admin/products/${id}`, payload);
    return res.data;
  },

  /**
   * Admin: Deactivate (soft-delete) or permanently delete a product
   */
  async adminDeleteProduct(id: string, hardDelete: boolean = false): Promise<{ success: boolean; message: string }> {
    const res = await axiosClient.delete<{ success: boolean; message: string }>(`/api/admin/products/${id}`, {
      params: { hard_delete: hardDelete },
    });
    return res.data;
  },

  /**
   * Admin: Upload product photography to Supabase Storage bucket 'product-images'
   */
  async adminUploadProductImage(id: string, file: File): Promise<{ success: boolean; url: string; images: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axiosClient.post<{ success: boolean; url: string; images: string[] }>(
      `/api/admin/products/${id}/images`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return res.data;
  },
};

export default productApi;
