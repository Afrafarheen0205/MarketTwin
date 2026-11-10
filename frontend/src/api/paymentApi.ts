import { axiosClient } from './axiosClient';
import type { MatchedProduct, RequirementDraft } from './aiApi';

export const CHECKOUT_CONTEXT_KEY = 'markettwin_paypal_checkout_context_v1';

export interface CheckoutContext {
  productId: string;
  requirements: RequirementDraft;
  idempotencyKey: string;
}

export interface CatalogueQuote {
  product: MatchedProduct;
  product_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  shipping: string | null;
  tax: string | null;
  total: string;
  currency: string;
}

export interface MarketTwinOrder {
  id: string;
  order_number: string;
  product_id: string;
  product_name: string;
  product_snapshot: MatchedProduct;
  quantity: number;
  unit_price: string;
  total_price: string;
  total_amount: string;
  currency: string;
  payment_status: string;
  order_status: string;
}

export const saveCheckoutContext = (context: CheckoutContext): void => {
  sessionStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
};

export const readCheckoutContext = (): CheckoutContext | null => {
  try {
    const saved = sessionStorage.getItem(CHECKOUT_CONTEXT_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as CheckoutContext).productId !== 'string' ||
      typeof (parsed as CheckoutContext).idempotencyKey !== 'string' ||
      !(parsed as CheckoutContext).requirements
    ) {
      return null;
    }
    return parsed as CheckoutContext;
  } catch {
    return null;
  }
};

export const quoteCatalogueCheckout = async (
  context: CheckoutContext,
  quantity: number
): Promise<CatalogueQuote> => {
  const { data } = await axiosClient.post<CatalogueQuote>('/api/v1/customer/orders/quote', {
    product_id: context.productId,
    quantity,
    requirements: context.requirements,
  });
  return data;
};

export const createCatalogueCheckout = async (
  context: CheckoutContext,
  quantity: number
): Promise<MarketTwinOrder> => {
  const { data } = await axiosClient.post<MarketTwinOrder>('/api/v1/customer/orders/checkout', {
    product_id: context.productId,
    quantity,
    requirements: context.requirements,
    idempotency_key: context.idempotencyKey,
  });
  return data;
};

export const createPayPalOrder = async (
  orderId: string
): Promise<{ paypal_order_id: string; approval_url: string; status: string }> => {
  const { data } = await axiosClient.post(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/payments/paypal/create`
  );
  return data;
};

export const capturePayPalPayment = async (
  orderId: string,
  paypalOrderId: string
): Promise<{ status: string; capture_id: string }> => {
  const { data } = await axiosClient.post(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/payments/paypal/capture`,
    { paypal_order_id: paypalOrderId }
  );
  return data;
};

export const cancelPayPalPayment = async (orderId: string): Promise<{ status: string }> => {
  const { data } = await axiosClient.post(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/payments/paypal/cancel`
  );
  return data;
};

export const getCustomerOrder = async (orderId: string): Promise<MarketTwinOrder> => {
  const { data } = await axiosClient.get<MarketTwinOrder>(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}`
  );
  return data;
};
