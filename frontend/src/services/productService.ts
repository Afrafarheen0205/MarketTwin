import { productApi, Product } from '../api/productApi';

export type ProductRecord = Product;

export const fetchProducts = async (): Promise<ProductRecord[]> => {
  try {
    const res = await productApi.getProducts({ page: 1, page_size: 100 });
    return res.items;
  } catch (err) {
    console.error('Failed to fetch products via API:', err);
    return [];
  }
};

export const fetchCategories = async (): Promise<string[]> => {
  try {
    return await productApi.getCategories();
  } catch (err) {
    console.error('Failed to fetch categories via API:', err);
    return [];
  }
};

export const fetchRecommendations = async (userId?: string, limit: number = 8): Promise<ProductRecord[]> => {
  try {
    return await productApi.getRecommendations(userId, limit);
  } catch (err) {
    console.error('Failed to fetch recommendations:', err);
    return [];
  }
};

export const fetchPopularProducts = async (limit: number = 8): Promise<ProductRecord[]> => {
  try {
    return await productApi.getPopularProducts(limit);
  } catch (err) {
    console.error('Failed to fetch popular products:', err);
    return [];
  }
};

export const fetchRecentlyAddedProducts = async (limit: number = 8): Promise<ProductRecord[]> => {
  try {
    return await productApi.getRecentlyAddedProducts(limit);
  } catch (err) {
    console.error('Failed to fetch recently added products:', err);
    return [];
  }
};

export const fetchSimilarAndAlternatives = async (
  productId: string,
  limit: number = 6
) => {
  try {
    return await productApi.getSimilarAndAlternatives(productId, limit);
  } catch (err) {
    console.error('Failed to fetch similar and alternative products:', err);
    return { similar: [], alternatives: [], related: [] };
  }
};
