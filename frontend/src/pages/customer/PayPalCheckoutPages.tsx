import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, InputNumber, Result, Spin, Tag, Typography } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CatalogueQuote, MarketTwinOrder, PayPalOrderDetails } from '../../api/paymentApi';
import {
  cancelPayPalPayment,
  capturePayPalPayment,
  createCatalogueCheckout,
  createPayPalOrder,
  getCustomerOrder,
  quoteCatalogueCheckout,
  readCheckoutContext,
} from '../../api/paymentApi';

const { Paragraph, Text, Title } = Typography;

const formatMoney = (value: string | number | null | undefined, currency: string): string => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Not specified';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${value} ${currency}`;
  }
};

const toMinorUnits = (value: string | number): number | null => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const minorUnits = Math.round(amount * 100);
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
};

const ProductImage: React.FC<{ quote: CatalogueQuote }> = ({ quote }) => {
  const image = quote.product.images.find((url) => /^https?:\/\/\S+$/i.test(url));
  return image ? (
    <img
      src={image}
      alt={quote.product.name || 'Catalogue product'}
      style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 8 }}
    />
  ) : (
    <div style={{ width: 120, height: 120, display: 'grid', placeItems: 'center', background: '#f5f5f5' }}>
      No image
    </div>
  );
};

const OrderSummary: React.FC<{ quote: CatalogueQuote }> = ({ quote }) => (
  <Card>
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <ProductImage quote={quote} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <Title level={4}>{quote.product.name || 'Catalogue product'}</Title>
        <Paragraph type="secondary">
          {quote.product.brand || 'Brand not specified'} · Product ID: {quote.product_id}
        </Paragraph>
        <Tag color={quote.match_classification === 'EXACT_MATCH' ? 'green' : 'gold'}>
          {quote.match_classification === 'EXACT_MATCH' ? 'Exact match' : 'Closest alternative'}
        </Tag>
        <Paragraph>
          Delivery estimate: {quote.product.delivery_days === null
            ? 'Not provided by the catalogue'
            : `${quote.product.delivery_days} days`}
        </Paragraph>
        <Paragraph>Available stock: {quote.product.stock === null ? 'Not specified' : quote.product.stock}</Paragraph>
      </div>
    </div>
    <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
      <Text>Unit price: {formatMoney(quote.unit_price, quote.currency)}</Text>
      <Text>Quantity: {quote.quantity}</Text>
      <Text>Subtotal: {formatMoney(quote.subtotal, quote.currency)}</Text>
      <Text>Shipping: {quote.shipping === null ? 'Not provided' : formatMoney(quote.shipping, quote.currency)}</Text>
      <Text>Tax: {quote.tax === null ? 'Not provided' : formatMoney(quote.tax, quote.currency)}</Text>
      <Title level={4} style={{ margin: 0 }}>Total: {formatMoney(quote.total, quote.currency)}</Title>
      <Text type="secondary">The final amount is calculated by MarketTwin from the verified catalogue price.</Text>
      {quote.paypal_conversion && (
        <Alert
          type="info"
          showIcon
          message="PayPal Sandbox currency conversion"
          description={(
            <div style={{ display: 'grid', gap: 4 }}>
              <Text>
                Rate: 1 {quote.paypal_conversion.original_currency} = {quote.paypal_conversion.exchange_rate} {quote.paypal_conversion.paypal_currency}
              </Text>
              <Text>PayPal Sandbox amount: {formatMoney(quote.paypal_conversion.paypal_amount, quote.paypal_conversion.paypal_currency)}</Text>
              <Text>Source: {quote.paypal_conversion.exchange_rate_source}</Text>
              <Text>PayPal Sandbox processes this test payment in USD. Your MarketTwin order remains priced in {quote.paypal_conversion.original_currency}.</Text>
            </div>
          )}
        />
      )}
      {quote.paypal_conversion_error && (
        <Alert type="warning" showIcon message="PayPal conversion is not configured" description={quote.paypal_conversion_error} />
      )}
    </div>
  </Card>
);

export const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const productId = search.get('product_id');
  const context = readCheckoutContext();
  const [quantity, setQuantity] = useState(1);
  const [quote, setQuote] = useState<CatalogueQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paypalIntent, setPaypalIntent] = useState<PayPalOrderDetails | null>(null);
  const quoteSequence = useRef(0);

  useEffect(() => {
    if (!context || context.productId !== productId || !Number.isInteger(quantity) || quantity < 1) {
      setQuote(null);
      return;
    }
    const sequence = ++quoteSequence.current;
    setPaypalIntent(null);
    setLoadingQuote(true);
    setError(null);
    void quoteCatalogueCheckout(context, quantity)
      .then((result) => {
        if (sequence === quoteSequence.current) setQuote(result);
      })
      .catch((reason: unknown) => {
        if (sequence === quoteSequence.current) {
          setQuote(null);
          setError(reason instanceof Error ? reason.message : 'Product availability could not be verified.');
        }
      })
      .finally(() => {
        if (sequence === quoteSequence.current) setLoadingQuote(false);
      });
  }, [context?.idempotencyKey, context?.productId, productId, quantity]);

  const continueToPayPal = async (): Promise<void> => {
    if (!context || !quote || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await createCatalogueCheckout(context, quantity);
      if (!order.id) throw new Error('MarketTwin did not return an order reference.');
      const authoritativeTotal = order.total_amount ?? order.total_price;
      if (
        toMinorUnits(authoritativeTotal) === null ||
        toMinorUnits(authoritativeTotal) !== toMinorUnits(quote.total) ||
        order.currency !== quote.currency ||
        order.quantity !== quote.quantity ||
        toMinorUnits(order.unit_price) === null ||
        toMinorUnits(order.unit_price) !== toMinorUnits(quote.unit_price) ||
        order.match_classification !== quote.match_classification
      ) {
        const refreshedQuote = await quoteCatalogueCheckout(context, quantity);
        setQuote(refreshedQuote);
        throw new Error('The catalogue price changed. Review the refreshed order total before continuing.');
      }
      const paypal = await createPayPalOrder(order.id);
      const approval = new URL(paypal.approval_url);
      if (
        approval.protocol !== 'https:' ||
        !(
          approval.hostname === 'sandbox.paypal.com' ||
          approval.hostname.endsWith('.sandbox.paypal.com')
        )
      ) {
        throw new Error('PayPal returned an invalid approval link.');
      }
      if (
        paypal.original_currency !== quote.currency ||
        toMinorUnits(paypal.original_amount) !== toMinorUnits(quote.total) ||
        paypal.paypal_currency !== 'USD' ||
        toMinorUnits(paypal.paypal_amount) === null
      ) {
        throw new Error('The verified PayPal conversion does not match this order. Contact support before proceeding.');
      }
      setPaypalIntent(paypal);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to continue to PayPal.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!context || context.productId !== productId) {
    return (
      <Result
        status="warning"
        title="Checkout context is unavailable"
        subTitle="Return to product matching and select an exact match again."
        extra={<Button type="primary" onClick={() => navigate('/customer/search')}>Back to product search</Button>}
      />
    );
  }

  return (
    <section style={{ maxWidth: 860, margin: '0 auto', padding: 24 }}>
      <Title level={2}>Review your order</Title>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {loadingQuote && <div style={{ padding: 24, textAlign: 'center' }}><Spin tip="Verifying product price and stock..." /></div>}
      {quote && <OrderSummary quote={quote} />}
      {paypalIntent && (
        <Card style={{ marginTop: 16 }}>
          <Title level={4}>Confirm PayPal Sandbox amount</Title>
          <Paragraph>MarketTwin order total: {formatMoney(paypalIntent.original_amount, paypalIntent.original_currency)}</Paragraph>
          <Paragraph>Exchange rate: 1 {paypalIntent.original_currency} = {paypalIntent.exchange_rate} {paypalIntent.paypal_currency}</Paragraph>
          <Paragraph>PayPal Sandbox charge: {formatMoney(paypalIntent.paypal_amount, paypalIntent.paypal_currency)}</Paragraph>
          <Paragraph type="secondary">
            This test payment is charged in USD by PayPal Sandbox. MarketTwin retains the original order total in {paypalIntent.original_currency}.
            Rate source: {paypalIntent.exchange_rate_source}.
          </Paragraph>
          <Button type="primary" onClick={() => window.location.assign(paypalIntent.approval_url)}>
            Pay {formatMoney(paypalIntent.paypal_amount, paypalIntent.paypal_currency)} in PayPal Sandbox
          </Button>
        </Card>
      )}
      {!loadingQuote && (
        <div style={{ marginTop: 20 }}>
          <Text strong>Quantity</Text>
          <div>
            <InputNumber
              min={1}
              max={quote?.product.stock ?? 1_000_000}
              precision={0}
              value={quantity}
              disabled={submitting}
              onChange={(value) => setQuantity(Number(value || 1))}
            />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
        <Button onClick={() => navigate('/customer/search')} disabled={submitting}>Back</Button>
        <Button
          type="primary"
          loading={submitting}
          disabled={!quote || !quote.paypal_conversion || loadingQuote || submitting || Boolean(paypalIntent)}
          onClick={() => void continueToPayPal()}
        >
          Prepare PayPal Sandbox payment
        </Button>
      </div>
    </section>
  );
};

export const PaymentSuccessPage: React.FC = () => {
  const [search] = useSearchParams();
  const orderId = search.get('order_id');
  const paypalOrderId = search.get('token');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<MarketTwinOrder | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const requestLock = useRef(false);
  const navigate = useNavigate();

  const verifyPayment = useCallback(async () => {
    if (!orderId || !paypalOrderId || requestLock.current) {
      if (!orderId || !paypalOrderId) {
        setError('The PayPal return is missing its order reference. Payment was not confirmed.');
        setBusy(false);
      }
      return;
    }
    requestLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const capture = await capturePayPalPayment(orderId, paypalOrderId);
      if (capture.status !== 'COMPLETED' || !capture.capture_id) {
        throw new Error('MarketTwin could not verify a completed PayPal capture.');
      }
      const verifiedOrder = await getCustomerOrder(orderId);
      if (verifiedOrder.payment_status !== 'Paid') {
        throw new Error('The capture was received but the order is not yet marked paid.');
      }
      setCaptureId(capture.capture_id);
      setOrder(verifiedOrder);
      sessionStorage.removeItem('markettwin_paypal_checkout_context_v1');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment verification failed. Please retry.');
    } finally {
      requestLock.current = false;
      setBusy(false);
    }
  }, [orderId, paypalOrderId]);

  useEffect(() => {
    void verifyPayment();
  }, [verifyPayment]);

  if (busy) {
    return <div style={{ padding: 48, textAlign: 'center' }}><Spin tip="Verifying your PayPal payment..." /></div>;
  }
  if (error || !order) {
    return (
      <Result
        status="warning"
        title="Payment is not yet verified"
        subTitle={error || 'No verified order was returned.'}
        extra={[
          <Button key="retry" type="primary" onClick={() => void verifyPayment()}>Retry verification</Button>,
          <Button key="orders" onClick={() => navigate('/customer/orders')}>View my orders</Button>,
        ]}
      />
    );
  }
  return (
    <Result
      status="success"
      title="Payment confirmed"
      subTitle="PayPal confirmed the capture and MarketTwin marked the order as paid."
      extra={[
        <Card key="order" style={{ maxWidth: 480, margin: '0 auto', textAlign: 'left' }}>
          <Paragraph>Order: <Text strong>{order.order_number || order.id}</Text></Paragraph>
          <Paragraph>Status: <Tag color="green">{order.payment_status}</Tag></Paragraph>
          <Paragraph>Amount: {formatMoney(order.total_amount || order.total_price, order.currency)}</Paragraph>
          <Paragraph>PayPal capture ID: {captureId}</Paragraph>
        </Card>,
        <Button key="dashboard" type="primary" onClick={() => navigate('/customer/dashboard')}>
          Return to customer dashboard
        </Button>,
        <Button key="orders" onClick={() => navigate('/customer/orders')}>View my orders</Button>,
      ]}
    />
  );
};

export const PaymentCancelledPage: React.FC = () => {
  const [search] = useSearchParams();
  const orderId = search.get('order_id');
  const [message, setMessage] = useState('Your order remains unpaid.');
  const [busy, setBusy] = useState(Boolean(orderId));
  const navigate = useNavigate();

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    void cancelPayPalPayment(orderId)
      .then(() => {
        if (active) setMessage('Cancellation recorded. Your order remains unpaid.');
      })
      .catch(() => {
        if (active) setMessage('Your order remains unpaid. Cancellation could not be recorded; you can safely review your orders.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [orderId]);

  return (
    <Result
      status="info"
      title="Payment cancelled"
      subTitle={busy ? 'Recording cancellation...' : message}
      extra={[
        <Button key="checkout" onClick={() => navigate('/customer/search')}>Return to product search</Button>,
        <Button key="orders" type="primary" onClick={() => navigate('/customer/orders')}>View my orders</Button>,
      ]}
    />
  );
};

export const PaymentFailurePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Result
      status="error"
      title="Payment could not be completed"
      subTitle="Your order has not been marked as paid. You can review your orders or return to product search."
      extra={[
        <Button key="orders" type="primary" onClick={() => navigate('/customer/orders')}>View my orders</Button>,
        <Button key="search" onClick={() => navigate('/customer/search')}>Return to product search</Button>,
      ]}
    />
  );
};
