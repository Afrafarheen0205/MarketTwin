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

export interface ProductQueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  sort_by?: 'newest' | 'price_asc' | 'price_desc' | 'popular';
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
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
