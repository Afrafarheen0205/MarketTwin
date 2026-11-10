import axios from 'axios';
import axiosClient from '../api/axiosClient';

export interface OfferSubmitRequest {
  unit_price: string;
  min_order_quantity: string;
  delivery_days: number;
  warranty_months: number;
  spec_notes: string;
  shipping_terms: string;
}

export interface MerchantOffer {
  id: string;
  offer_code: string;
  demand_id: string | null;
  group_id: string | null;
  demand_title: string | null;
  merchant_id: string | null;
  merchant_name: string | null;
  merchant_rating: number | string | null;
  unit_price: number | string;
  currency?: string | null;
  original_target_price: number | string | null;
  total_offer_amount: number | string | null;
  quoted_quantity: number | string | null;
  min_order_quantity: number | string | null;
  delivery_days: number | null;
  warranty_months: number | null;
  spec_notes: string | null;
  shipping_terms: string | null;
  status: 'Submitted' | 'Under Review' | 'Customer Approved' | 'Rejected';
  submitted_date: string;
}

export interface BiddingGroup {
  id: string;
  group_code: string;
  product_title: string;
  total_quantity: number | string;
  currency?: string | null;
}

export interface CustomerOffer extends MerchantOffer {
  customer_demand_id: string;
  customer_quantity: number | string;
  eligibility: { status: 'Eligible' | 'Not Eligible'; details: { checks: string[] } };
}

export const fetchCustomerOffers = async (): Promise<CustomerOffer[]> => {
  const { data } = await axiosClient.get<{ items: CustomerOffer[] }>('/api/v1/customer/offers');
  return data.items;
};

export const acceptOffer = async (offer: CustomerOffer, termsAccepted: boolean) => {
  if (!termsAccepted) throw new Error('Terms must be accepted.');
  const { data } = await axiosClient.post<{ id: string; order: { id: string; order_number: string } }>(
    `/api/v1/customer/demands/${offer.customer_demand_id}/select-offer`, {
      offer_id: offer.id, terms_accepted: true, expected_unit_price: String(offer.unit_price),
      expected_quantity: String(offer.customer_quantity),
    });
  if (!data.order?.id) throw new Error('Acceptance did not return an order. Refresh before retrying.');
  return data;
};

export const customerTotal = (offer: CustomerOffer): string =>
  (Math.round(Number(offer.unit_price) * 100) * Number(offer.customer_quantity) / 100).toFixed(2);

export const isCurrencyAvailable = (currency: string | null | undefined): currency is string =>
  typeof currency === 'string' && /^[A-Z]{3}$/i.test(currency.trim());

export const formatOfferCurrency = (
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): string => {
  if (amount == null || amount === '') return 'Not available';
  if (!isCurrencyAvailable(currency)) return `${amount} (currency unavailable)`;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return 'Not available';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.trim().toUpperCase(),
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);
};

export function offerError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail: unknown = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (error.response?.status === 422) return 'Check the required fields, price precision, and quantity limits.';
  }
  return 'The offer operation could not be completed. Refresh before retrying.';
}

export const fetchOffers = async (filters?: { merchantId?: string; demandId?: string }): Promise<MerchantOffer[]> => {
  const { data } = await axiosClient.get<{ items: MerchantOffer[] }>('/api/v1/merchant/offers');
  return data.items.filter(offer => !filters?.demandId || offer.demand_id === filters.demandId);
};

export const fetchBiddingGroup = async (groupId: string): Promise<BiddingGroup> => {
  const { data } = await axiosClient.get<{ group: BiddingGroup }>(`/api/v1/merchant/demand-groups/${groupId}`);
  return data.group;
};

export const fetchMerchantDemand = async (demandId: string): Promise<any> => {
  const { data } = await axiosClient.get<{ demand: any }>(`/api/v1/merchant/demands/${demandId}`);
  return data.demand;
};

export const createOffer = async (groupId: string, payload: OfferSubmitRequest): Promise<MerchantOffer> => {
  const { data } = await axiosClient.post<MerchantOffer>(`/api/v1/merchant/demand-groups/${groupId}/offers`, payload);
  return data;
};

export const createDemandOffer = async (demandId: string, payload: OfferSubmitRequest): Promise<MerchantOffer> => {
  const { data } = await axiosClient.post<MerchantOffer>(`/api/v1/merchant/demands/${demandId}/offers`, payload);
  return data;
};

export const reviseOffer = async (offer: MerchantOffer, unitPrice: string): Promise<MerchantOffer> => {
  const { data } = await axiosClient.patch<MerchantOffer>(`/api/v1/merchant/offers/${offer.id}`, {
    unit_price: unitPrice,
    expected_unit_price: String(offer.unit_price),
  });
  return data;
};