import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Result,
  Row,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  FileAddOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  createDemandOffer,
  createOffer,
  fetchBiddingGroup,
  isCurrencyAvailable,
  offerError,
  type BiddingGroup,
  type MerchantOffer,
  type OfferSubmitRequest,
} from '../../services/offerService';
import {
  fetchActiveDemand,
  type ActiveDemand,
} from '../../services/merchantDemandService';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const SubmitOffer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const demandId = searchParams.get('demand') || '';
  const groupId = searchParams.get('group') || '';
  const isDirectDemand = Boolean(demandId);

  const [demand, setDemand] = useState<ActiveDemand | null>(null);
  const [group, setGroup] = useState<BiddingGroup | null>(null);
  const [form] = Form.useForm<OfferSubmitRequest>();
  const [submitted, setSubmitted] = useState(false);
  const [createdOffer, setCreatedOffer] = useState<MerchantOffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setDemand(null);
    setGroup(null);
    setSubmitted(false);
    setCreatedOffer(null);
    setError(null);
    form.resetFields();

    const load = async () => {
      if (!demandId && !groupId) {
        setError('Select an available demand before submitting an offer.');
        return;
      }
      try {
        if (demandId) {
          const row = await fetchActiveDemand(demandId);
          if (!active) return;
          if (!row) {
            setError('This demand is no longer available for offers.');
            return;
          }
          setDemand(row);
        } else {
          const data = await fetchBiddingGroup(groupId);
          if (active) setGroup(data);
        }
      } catch (failure) {
        if (active) setError(offerError(failure));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [demandId, groupId, form]);

  const opportunity = isDirectDemand ? demand : group;
  if (!opportunity && !error) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>Loading demand details...</div>;
  }
  if (!opportunity) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/merchant/demands')}>
          Back to Available Demands
        </Button>
        <Alert type="error" title={error ?? 'This opportunity is unavailable.'} showIcon />
      </div>
    );
  }

  const title = isDirectDemand ? (demand as ActiveDemand).title : (group as BiddingGroup).product_title;
  const reference = isDirectDemand ? (demand as ActiveDemand).demand_code : (group as BiddingGroup).group_code;
  const quantity = Number(
    isDirectDemand ? (demand as ActiveDemand).target_quantity : (group as BiddingGroup).total_quantity,
  );
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const rawCurrency = isDirectDemand ? (demand as ActiveDemand).currency : (group as BiddingGroup).currency;
  const currency = isCurrencyAvailable(rawCurrency) ? rawCurrency.trim().toUpperCase() : null;

  const onFinish = async (values: OfferSubmitRequest) => {
    if (!opportunity || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = isDirectDemand
        ? await createDemandOffer((demand as ActiveDemand).id, values)
        : await createOffer((group as BiddingGroup).id, values);
      setCreatedOffer(data);
      setSubmitted(true);
    } catch (failure) {
      setError(offerError(failure));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  if (submitted && createdOffer) {
    return (
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', padding: 24 }}>
        <Result
          status="success"
          title="Offer Submitted Successfully!"
          subTitle={
            <span>
              Offer Code: <strong>{createdOffer.offer_code}</strong>. Your proposal is now visible to
              the customer.
            </span>
          }
          extra={[
            <Button type="primary" key="offers" onClick={() => navigate('/merchant/offers')}>
              View My Submitted Offers
            </Button>,
            <Button key="demands" onClick={() => navigate('/merchant/demands')}>
              Browse More Demands
            </Button>,
          ]}
        />
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/merchant/demands')}>
          Back to Available Demands
        </Button>
      </div>

      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 28 } }}>
        <Title level={4} style={{ margin: 0, color: '#172B4D' }}>
          Submit Competitive Offer for {title}
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {isDirectDemand ? 'Customer demand' : 'Demand pool'}: <strong>{reference}</strong> ·{' '}
          {safeQuantity || '—'} {isDirectDemand ? (demand as ActiveDemand).unit || 'units' : 'units'} requested
        </Text>

        {isDirectDemand && (
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2, md: 3 }}
            style={{ marginTop: 16, background: '#F5F7FA', padding: 12, borderRadius: 8 }}
          >
            <Descriptions.Item label="Category">
              {(demand as ActiveDemand).category || 'Uncategorised'}
            </Descriptions.Item>
            <Descriptions.Item label="Target Price">
              {(() => {
                const current = demand as ActiveDemand;
                const min = current.min_target_unit_price;
                const max = current.max_target_unit_price;
                if (min != null && max != null) return `${min} – ${max} ${current.currency ?? ''}`.trim();
                if (max != null) return `Up to ${max} ${current.currency ?? ''}`.trim();
                if (min != null) return `From ${min} ${current.currency ?? ''}`.trim();
                return current.target_price != null
                  ? `${current.target_price} ${current.currency ?? ''}`.trim()
                  : 'Not specified';
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="Delivery Timeline">
              {(demand as ActiveDemand).required_delivery_time ||
                ((demand as ActiveDemand).expected_lead_time
                  ? `${(demand as ActiveDemand).expected_lead_time} days`
                  : 'Not specified')}
            </Descriptions.Item>
          </Descriptions>
        )}

        <Paragraph type="secondary" style={{ margin: '12px 0 0 0', fontSize: 12 }}>
          Quotes are evaluated against the customer's mandatory specifications. Include compliance
          notes and any assumptions with your price and delivery terms.
        </Paragraph>

        <Divider style={{ margin: '18px 0' }} />
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        {!currency && (
          <Alert
            type="warning"
            title="Currency unavailable"
            description="This demand has no confirmed currency, so an offer cannot be submitted."
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form form={form} layout="vertical" onFinish={onFinish} disabled={loading || !currency}>
          <Row gutter={20}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="unit_price"
                label={`Offered Wholesale Price Per Unit (${currency ?? 'currency unavailable'})`}
                rules={[{ required: true, message: 'Please provide a unit price' }]}
              >
                <InputNumber
                  stringMode
                  min="0.01"
                  max="9999999999.99"
                  precision={2}
                  style={{ width: '100%' }}
                  size="large"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="min_order_quantity"
                label="Minimum Required Order Quantity (Units)"
                rules={[
                  { required: true, message: 'Please provide a minimum quantity' },
                  {
                    validator: async (_rule, value: string | undefined) => {
                      if (value == null || value === '') return;
                      const parsed = Number(value);
                      if (!Number.isFinite(parsed) || parsed <= 0) {
                        throw new Error('Quantity must be greater than zero.');
                      }
                      if (safeQuantity > 0 && parsed > safeQuantity) {
                        throw new Error('Minimum quantity cannot exceed the demand quantity.');
                      }
                    },
                  },
                ]}
              >
                <InputNumber
                  stringMode
                  min="0"
                  max={safeQuantity > 0 ? String(safeQuantity) : undefined}
                  step="0.1"
                  style={{ width: '100%' }}
                  size="large"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={20}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="delivery_days"
                label="Fulfillment Lead Time (Business Days)"
                rules={[{ required: true, type: 'integer', min: 1, max: 90 }]}
              >
                <InputNumber min={1} max={90} precision={0} style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="warranty_months"
                label="Commercial Warranty Period (Months)"
                rules={[{ required: true, type: 'integer', min: 6, max: 120 }]}
              >
                <InputNumber min={6} max={120} precision={0} style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="shipping_terms"
            label="Logistics & Delivery Inclusions"
            rules={[{ required: true, whitespace: true, max: 2000, message: 'Please enter shipping terms (up to 2000 characters)' }]}
          >
            <Input maxLength={2000} size="large" />
          </Form.Item>

          <Form.Item
            name="spec_notes"
            label="Technical Compliance & Material Specifications"
            rules={[{ required: true, whitespace: true, max: 10000, message: 'Please explain compliance (up to 10000 characters)' }]}
          >
            <TextArea maxLength={10000} rows={4} />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            size="large"
            icon={<FileAddOutlined />}
            loading={loading}
            disabled={!currency}
          >
            <ThunderboltOutlined /> Submit Formal Offer
          </Button>
        </Form>
      </Card>
    </div>
  );
};

export default SubmitOffer;
