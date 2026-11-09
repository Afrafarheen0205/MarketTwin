import React, { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Form, Input, InputNumber, Select, Button, Row, Col, Typography, Alert, Divider, Result, Descriptions, Space } from 'antd';
import { FileAddOutlined, DollarOutlined, CarOutlined, CheckCircleOutlined, ThunderboltOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { createOffer, fetchBiddingGroup, isCurrencyAvailable, offerError, type BiddingGroup, type MerchantOffer, type OfferSubmitRequest } from '../../services/offerService';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const SubmitOffer: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('group') || '';
  const [group, setGroup] = useState<BiddingGroup | null>(null);
  const [form] = Form.useForm<OfferSubmitRequest>();
  const [submitted, setSubmitted] = useState(false);
  const [createdOffer, setCreatedOffer] = useState<MerchantOffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  React.useEffect(() => {
    let active = true;
    setGroup(null);
    setSubmitted(false);
    setError(null);
    const load = async () => {
      if (!groupId) { setError('Select a bidding opportunity first.'); return; }
      try {
        const data = await fetchBiddingGroup(groupId);
        if (active) { setGroup(data); form.resetFields(); }
      } catch (failure) {
        if (active) setError(offerError(failure));
      }
    };
    load();
    return () => { active = false; };
  }, [groupId, form]);

  const onFinish = async (values: OfferSubmitRequest) => {
    if (!group || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await createOffer(group.id, values);
      setCreatedOffer(data);
      setSubmitted(true);
    } catch (failure) {
      setError(offerError(failure));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
    return;
  };

  if (submitted && createdOffer) {
    return (<Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', padding: 24 }}><Result status="success" title="Offer Submitted Successfully!" subTitle={<span>Offer Code: <strong>{createdOffer.offer_code}</strong>. Your proposal is now visible to customers.</span>} extra={[<Button type="primary" key="offers" onClick={() => navigate('/merchant/offers')}>View My Submitted Offers</Button>, <Button key="demands" onClick={() => navigate('/merchant/demands')}>Browse More Demands</Button>]} /></Card>);
  }

  if (!group) return error ? <Alert type="error" title={error} showIcon /> : <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>Loading demand pool...</div>;
  const currency = isCurrencyAvailable(group.currency) ? group.currency.trim().toUpperCase() : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/merchant/demands')}>Back to Demands</Button></div>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 28 } }}>
        <Title level={4} style={{ margin: 0, color: '#172B4D' }}>Submit Competitive Offer for {group.product_title}</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>Targeting Demand Pool: <strong>{group.group_code}</strong> ({group.total_quantity} units committed)</Text>
        <Divider style={{ margin: '18px 0' }} />
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        {!currency && <Alert type="warning" title="Currency unavailable" description="This demand pool has no confirmed currency, so an offer cannot be submitted." showIcon style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" onFinish={onFinish} disabled={loading || !currency}>
          <Row gutter={20}>
            <Col xs={24} sm={12}><Form.Item name="unit_price" label={`Offered Wholesale Price Per Unit (${currency ?? 'currency unavailable'})`} rules={[{ required: true, message: 'Please provide unit price' }]}><InputNumber stringMode min="0.01" max="9999999999.99" precision={2} style={{ width: '100%' }} size="large" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="min_order_quantity" label="Minimum Required Order Quantity (Units)" rules={[{ required: true, message: 'Please provide a minimum quantity' }, { validator: async (_rule, value: string | undefined) => {
              if (value == null || value === '') return;
              const quantity = Number(value);
              if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Quantity must be greater than zero.');
              if (quantity > Number(group.total_quantity)) throw new Error('Minimum quantity cannot exceed the demand quantity.');
            } }]}><InputNumber stringMode min="0" max={String(group.total_quantity)} step="0.1" style={{ width: '100%' }} size="large" /></Form.Item></Col>
          </Row>
          <Row gutter={20}>
            <Col xs={24} sm={12}><Form.Item name="delivery_days" label="Fulfillment Lead Time (Business Days)" rules={[{ required: true, type: 'integer', min: 1, max: 90 }]}><InputNumber min={1} max={90} precision={0} style={{ width: '100%' }} size="large" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="warranty_months" label="Commercial Warranty Period (Months)" rules={[{ required: true, type: 'integer', min: 6, max: 120 }]}><InputNumber min={6} max={120} precision={0} style={{ width: '100%' }} size="large" /></Form.Item></Col>
          </Row>
          <Form.Item name="shipping_terms" label="Logistics & Delivery Inclusions" rules={[{ required: true, whitespace: true, max: 2000, message: 'Please enter shipping terms (up to 2000 characters)' }]}><Input maxLength={2000} size="large" /></Form.Item>
          <Form.Item name="spec_notes" label="Technical Compliance & Material Specifications" rules={[{ required: true, whitespace: true, max: 10000, message: 'Please explain compliance (up to 10000 characters)' }]}><TextArea maxLength={10000} rows={4} /></Form.Item>
          <Button type="primary" htmlType="submit" size="large" icon={<FileAddOutlined />} loading={loading} disabled={!currency}>Submit Formal Offer</Button>
        </Form>
      </Card>
    </div>
  );
};

export default SubmitOffer;