import axiosClient from '../api/axiosClient';
import { supabase } from './supabase';

export interface CreateOrderPayload {
  customer_id?: string | null;
  order_number?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  product_title?: string | null;
  brand?: string | null;
  model?: string | null;
  unit?: string | null;
  unit_price?: number | null;
  quantity?: number | null;
  total_price?: number | null;
  total_amount?: number | null;
  status?: string | null;
  order_date?: string | null;
  product_image?: string | null;
  specs?: Record<string, any> | null;
  merchant_id?: string | null;
  merchant_name?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  delivery_address?: any;
  delivery_instructions?: string | null;
  payment_method?: string | null;
  transaction_reference?: string | null;
  demand_id?: string | null;
  demand_code?: string | null;
  [key: string]: unknown;
}

export const fetchOrders = async (filters?: { customerId?: string; merchantId?: string }) => {
  if (filters?.customerId) {
    const { data } = await axiosClient.get<{ items: unknown[] }>('/api/v1/customer/orders');
    return data.items;
  }
  if (!supabase) return [];
  let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (filters?.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }
  if (filters?.merchantId) {
    // Show orders assigned to this merchant OR general open catalog orders ready for fulfillment
    query = query.or(`merchant_id.eq.${filters.merchantId},merchant_id.is.null`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

export const fetchOrderDetails = async (orderId: string) => {
  if (!supabase) throw new Error('Supabase is not configured.');

  // Fetch core order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError) throw orderError;

  // Fetch associated items
  let items: any[] = [];
  try {
    const { data: itemsData } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);
    items = itemsData || [];
  } catch (err) {
    console.warn('Could not fetch order items:', err);
  }

  // Fetch status history
  let history: any[] = [];
  try {
    const { data: histData } = await supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    history = histData || [];
  } catch (err) {
    console.warn('Could not fetch status history:', err);
  }

  // Fetch shipments
  let shipments: any[] = [];
  try {
    const { data: shipData } = await supabase
      .from('shipments')
      .select('*')
      .eq('order_id', orderId);
    shipments = shipData || [];
  } catch (err) {
    console.warn('Could not fetch shipments:', err);
  }

  return {
    ...order,
    items,
    history,
    shipments,
  };
};

export const fetchMerchantStats = async (merchantId: string) => {
  if (!supabase) return { offersCount: 0, groupsCount: 0, ordersCount: 0, trustScore: null, ratingCount: 0, verifiedTier: null };

  try {
    // Run concurrent queries for dashboard metrics
    const [offersRes, groupsRes, ordersRes, merchantProfileRes] = await Promise.allSettled([
      supabase.from('merchant_offers').select('id', { count: 'exact', head: true }).eq('merchant_id', merchantId),
      supabase.from('demand_groups').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).or(`merchant_id.eq.${merchantId},merchant_id.is.null`),
      supabase.from('merchant_profiles').select('*').eq('id', merchantId).single(),
    ]);

    const offersCount = offersRes.status === 'fulfilled' ? offersRes.value.count || 0 : 0;
    const groupsCount = groupsRes.status === 'fulfilled' ? groupsRes.value.count || 0 : 0;
    const ordersCount = ordersRes.status === 'fulfilled' ? ordersRes.value.count || 0 : 0;

    let trustScore: number | null = null;
    let verifiedTier: string | null = null;
    let ratingCount = 0;

    if (merchantProfileRes.status === 'fulfilled' && merchantProfileRes.value.data) {
      const p = merchantProfileRes.value.data;
      if (p.rating && Number(p.rating) > 0) {
        trustScore = Number(p.rating);
      }
      if (p.verified_tier) {
        verifiedTier = p.verified_tier;
      }
    }

    return {
      offersCount,
      groupsCount,
      ordersCount,
      trustScore,
      ratingCount,
      verifiedTier,
    };
  } catch (err) {
    console.error('Failed to fetch merchant stats:', err);
    return { offersCount: 0, groupsCount: 0, ordersCount: 0, trustScore: null, ratingCount: 0, verifiedTier: null };
  }
};

export const createOrder = async (payload: CreateOrderPayload) => {
  if (!supabase) throw new Error('Supabase is not configured.');

  // Generate unique order number if not provided
  const orderNumber =
    payload.order_number ||
    `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

  const merchantId = payload.merchant_id || null;
  const merchantName = payload.merchant_name || payload.brand || null;

  const productName = (payload.product_name || payload.product_title || 'Commercial Product') as string;
  const quantity = Number(payload.quantity) || 1;
  const unitPrice = Number(payload.unit_price) || (Number(payload.total_price ?? payload.total_amount ?? 0) / quantity);
  const totalPrice = Number(payload.total_price ?? payload.total_amount ?? (unitPrice * quantity));

  // Construct complete metadata to preserve rich commercial specs & delivery info
  const richTerms: Record<string, unknown> = {
    product_id: payload.product_id || null,
    brand: payload.brand || merchantName,
    model: payload.model || null,
    unit: payload.unit || 'piece',
    unit_price: unitPrice,
    subtotal: totalPrice,
    tax_amount: 0.0,
    shipping_charges: 0.0,
    total_amount: totalPrice,
    product_image: payload.product_image || null,
    specifications: payload.specs || {},
    customer_name: payload.customer_name || null,
    customer_email: payload.customer_email || null,
    customer_phone: payload.customer_phone || null,
    delivery_address:
      typeof payload.delivery_address === 'object' && payload.delivery_address !== null
        ? payload.delivery_address
        : {
            address: typeof payload.delivery_address === 'string' ? payload.delivery_address : '',
            city: '',
            state: '',
            postal_code: '',
            instructions: payload.delivery_instructions || '',
          },
    payment_method: payload.payment_method || 'Corporate Escrow (PayPal B2B Protection)',
    transaction_reference: payload.transaction_reference || `TXN-PP-${Date.now().toString().slice(-8)}`,
  };

  // Construct record matching the PostgreSQL orders table schema
  const sanitizedOrder: Record<string, unknown> = {
    order_number: orderNumber,
    product_name: productName,
    merchant_id: merchantId,
    merchant_name: merchantName,
    quantity: quantity,
    total_price: totalPrice,
    status: 'Approved',
    order_date: (payload.order_date as string) || new Date().toISOString().split('T')[0],
    fulfillment_status: 'Not Started',
    payment_status: 'Escrow Secured',
    order_status: 'Confirmed',
    accepted_terms: richTerms,
  };

  if (payload.customer_id) {
    sanitizedOrder.customer_id = payload.customer_id;
  }
  if (payload.demand_id) {
    sanitizedOrder.demand_id = payload.demand_id;
  }
  if (payload.demand_code) {
    sanitizedOrder.demand_code = payload.demand_code;
  }

  const { data, error } = await supabase.from('orders').insert(sanitizedOrder).select().single();
  if (error) throw error;

  // Insert into order_items table for line-item integrity
  try {
    await supabase.from('order_items').insert({
      order_id: data.id,
      product_name: productName,
      quantity: quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      demand_id: payload.demand_id || null,
    });
  } catch (itemErr) {
    console.warn('Non-fatal: could not create order_item record:', itemErr);
  }

  // Insert initial record in order_status_history
  try {
    await supabase.from('order_status_history').insert({
      order_id: data.id,
      previous_status: null,
      new_status: 'Confirmed',
      status_message: 'Customer verified order and placed into Escrow protection.',
      actor_role: 'customer',
      updated_by: payload.customer_id || null,
    });
  } catch (histErr) {
    console.warn('Non-fatal: could not create status history record:', histErr);
  }

  // Broadcast event across windows/tabs for real-time reactivity
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('markettwin_order_created', { detail: data }));
  }

  return data;
};

export const updateOrderStatus = async (
  orderId: string,
  newStatus: string,
  extra?: {
    carrier?: string;
    tracking_number?: string;
    dispatch_date?: string;
    estimated_delivery?: string;
    merchant_id?: string;
    merchant_name?: string;
    remarks?: string;
  }
) => {
  if (!supabase) throw new Error('Supabase is not configured.');

  // Map incoming status string to database columns
  let highLevelStatus = 'Approved';
  let orderStatus = newStatus;
  let fulfillmentStatus = 'Processing';
  let step = 1;

  if (newStatus === 'Confirmed' || newStatus === 'Approved') {
    highLevelStatus = 'Approved';
    orderStatus = 'Confirmed';
    fulfillmentStatus = 'Confirmed';
    step = 0;
  } else if (newStatus === 'Processing') {
    highLevelStatus = 'Processing';
    orderStatus = 'Processing';
    fulfillmentStatus = 'Processing';
    step = 1;
  } else if (newStatus === 'Production / Preparation') {
    highLevelStatus = 'Processing';
    orderStatus = 'Production / Preparation';
    fulfillmentStatus = 'In Production';
    step = 1;
  } else if (newStatus === 'Ready for Dispatch') {
    highLevelStatus = 'Processing';
    orderStatus = 'Ready for Dispatch';
    fulfillmentStatus = 'Ready for Dispatch';
    step = 2;
  } else if (newStatus === 'Dispatched' || newStatus === 'Shipped') {
    highLevelStatus = 'Dispatched';
    orderStatus = 'Shipped';
    fulfillmentStatus = 'In Transit';
    step = 3;
  } else if (newStatus === 'Out for Delivery') {
    highLevelStatus = 'Dispatched';
    orderStatus = 'Out for Delivery';
    fulfillmentStatus = 'Out for Delivery';
    step = 3;
  } else if (newStatus === 'Delivered') {
    highLevelStatus = 'Delivered';
    orderStatus = 'Delivered';
    fulfillmentStatus = 'Delivered';
    step = 4;
  } else if (newStatus === 'Cancelled') {
    highLevelStatus = 'Cancelled';
    orderStatus = 'Cancelled';
    fulfillmentStatus = 'Cancelled';
    step = 0;
  }

  const updateData: Record<string, unknown> = {
    status: highLevelStatus,
    order_status: orderStatus,
    fulfillment_status: fulfillmentStatus,
    current_step: step,
  };

  if (extra?.carrier) updateData.carrier = extra.carrier;
  if (extra?.tracking_number) updateData.tracking_number = extra.tracking_number;
  if (extra?.estimated_delivery) updateData.estimated_delivery = extra.estimated_delivery;
  if (extra?.merchant_id) updateData.merchant_id = extra.merchant_id;
  if (extra?.merchant_name) updateData.merchant_name = extra.merchant_name;
  if (newStatus === 'Delivered') {
    updateData.payment_status = 'Released';
  }

  // Use the trusted FastAPI backend so offer-based orders (which are guarded
  // by the guard_offer_order_write_v1 trigger) can be updated securely.
  const { data } = await axiosClient.patch(`/api/v1/merchant/orders/${orderId}/fulfillment`, {
    status: newStatus,
    carrier: extra?.carrier,
    tracking_number: extra?.tracking_number,
    estimated_delivery: extra?.estimated_delivery,
    remarks: extra?.remarks,
    merchant_id: extra?.merchant_id,
    merchant_name: extra?.merchant_name,
  });
  if (!data) throw new Error('Fulfillment update did not return an order.');

  // Insert tracking event in order_status_history
  try {
    await supabase.from('order_status_history').insert({
      order_id: orderId,
      previous_status: null,
      new_status: orderStatus,
      status_message: extra?.remarks || `Merchant updated fulfillment milestone to "${orderStatus}"`,
      actor_role: 'merchant',
      updated_by: extra?.merchant_id || null,
    });
  } catch (histErr) {
    console.warn('Non-fatal: could not create status history record:', histErr);
  }

  // Insert or update shipment record if tracking info provided
  if (extra?.tracking_number || extra?.carrier) {
    try {
      await supabase.from('shipments').insert({
        shipment_reference: `SHP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`,
        order_id: orderId,
        merchant_id: extra?.merchant_id || null,
        logistics_provider: extra?.carrier || 'Commercial Logistics Partner',
        tracking_number: extra?.tracking_number || 'TRK-GEN',
        shipment_status: newStatus === 'Delivered' ? 'Delivered' : (highLevelStatus === 'Dispatched' ? 'Shipped' : 'Created'),
        dispatch_date: extra?.dispatch_date || new Date().toISOString(),
        estimated_delivery_date: extra?.estimated_delivery || null,
        shipping_remarks: extra?.remarks || 'Dispatched from merchant facility.',
      });
    } catch (shipErr) {
      console.warn('Non-fatal: could not create shipment record:', shipErr);
    }
  }

  // Broadcast event across windows/tabs for real-time reactivity
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('markettwin_order_updated', {
        detail: { orderId, status: highLevelStatus, order_status: orderStatus, ...extra },
      })
    );
  }

  return data;
};

export const subscribeToOrders = (callback: (payload: any) => void) => {
  if (!supabase) return () => {};

  const channelId = `orders_sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const channel = supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
      },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();

  const handleCustomEvent = (e: any) => {
    callback({ eventType: 'BROADCAST', new: e.detail });
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('markettwin_order_created', handleCustomEvent);
    window.addEventListener('markettwin_order_updated', handleCustomEvent);
  }

  return () => {
    if (supabase) {
      supabase.removeChannel(channel);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('markettwin_order_created', handleCustomEvent);
      window.removeEventListener('markettwin_order_updated', handleCustomEvent);
    }
  };
};
