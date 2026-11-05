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
