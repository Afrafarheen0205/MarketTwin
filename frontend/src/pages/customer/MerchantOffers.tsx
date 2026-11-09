import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Typography, Modal, Alert, Rate, Row, Col, Descriptions, message, Checkbox } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { TagsOutlined, DiffOutlined, CheckCircleOutlined, SafetyCertificateOutlined, CarOutlined } from '@ant-design/icons';
import { acceptOffer, customerTotal, fetchCustomerOffers, formatOfferCurrency, isCurrencyAvailable, offerError, type CustomerOffer } from '../../services/offerService';

const { Title, Text, Paragraph } = Typography;

export const MerchantOffers: React.FC = () => {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<CustomerOffer[]>([]);
  const [approvingOffer, setApprovingOffer] = useState<CustomerOffer | null>(null);
  const [explicitConsent, setExplicitConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const loadOffers = async () => {
    setLoading(true);
    try { setOffers(await fetchCustomerOffers()); setError(null); }
    catch (failure) { setError(offerError(failure)); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadOffers(); }, []);

  const handleApprove = async () => {
    if (!approvingOffer || !explicitConsent || !isCurrencyAvailable(approvingOffer.currency) || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const result = await acceptOffer(approvingOffer, explicitConsent);
      message.success(`Order ${result.order.order_number} created. Payment pending.`);
      setApprovingOffer(null);
      setExplicitConsent(false);
      navigate('/customer/orders');
    } catch (failure) { message.error(offerError(failure)); }
    finally { inFlight.current = false; setSaving(false); }
  };

  const columns: ColumnsType<CustomerOffer> = [
    { title: 'Offer Code', dataIndex: 'offer_code', key: 'offer_code', render: (code) => <Text strong style={{ color: '#1677FF' }}>{code}</Text> },
    { title: 'Merchant / Supplier', dataIndex: 'merchant_name', key: 'merchant_name', render: (name, record) => (<div><div style={{ fontWeight: 600 }}>{name ?? 'Unavailable'}</div>{record.merchant_rating != null && <Rate disabled value={Number(record.merchant_rating)} style={{ fontSize: 11, color: '#FAAD14' }} />}</div>) },
    { title: 'Demand Item', dataIndex: 'demand_title', key: 'demand_title', render: (title) => <span style={{ fontWeight: 500 }}>{title}</span> },
    { title: 'Unit Price', dataIndex: 'unit_price', render: (price, record) => formatOfferCurrency(price, record.currency) },
    { title: 'Your Quantity', dataIndex: 'customer_quantity' },
    { title: 'Your Total', render: (_, record) => formatOfferCurrency(customerTotal(record), record.currency) },
    { title: 'Delivery & Warranty', key: 'delivery', render: (_, record) => (<div><div><CarOutlined style={{ color: '#6B778C' }} /> {record.delivery_days} business days</div><div style={{ fontSize: 11, color: '#6B778C' }}>{record.warranty_months} months warranty</div></div>) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (status) => { let color = 'default'; if (status === 'Under Review') color = 'blue'; if (status === 'Customer Approved') color = 'green'; if (status === 'Rejected') color = 'red'; return <Tag color={color}>{status}</Tag>; } },
    { title: 'Actions', key: 'actions', render: (_, record) => (<Button type="primary" size="small" disabled={record.eligibility.status !== 'Eligible' || !isCurrencyAvailable(record.currency)} title={!isCurrencyAvailable(record.currency) ? 'Currency unavailable; this offer cannot be accepted.' : record.eligibility.details.checks.join(' ')} icon={<CheckCircleOutlined />} onClick={() => { setApprovingOffer(record); setExplicitConsent(false); }}>Approve Offer</Button>) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <Alert type="error" title={error} action={<Button onClick={loadOffers}>Retry</Button>} />}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: '20px 24px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={16}><Title level={4} style={{ margin: 0, color: '#172B4D' }}>Competitive Merchant Offers</Title><Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13 }}>Compare eligible merchant proposals. Purchases are finalized only after explicit buyer approval.</Paragraph></Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}><Button type="primary" icon={<DiffOutlined />} size="large" onClick={() => navigate('/customer/compare')}>Open Offer Comparison Matrix</Button></Col>
        </Row>
      </Card>
      <Alert message="Buyer Protection & Explicit Approval Gating" description="Merchants submit bids to your demand pools. You are under no obligation to buy until you explicitly review and approve a proposal." type="success" showIcon icon={<SafetyCertificateOutlined style={{ color: '#52C41A' }} />} style={{ background: '#F6FFED', borderColor: '#B7EB8F' }} />
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 0 } }}>
        <Table columns={columns} dataSource={offers} rowKey={offer => `${offer.customer_demand_id}:${offer.id}`} pagination={{ pageSize: 6 }} loading={loading} scroll={{ x: 1000 }} />
      </Card>
      <Modal title="Confirm Offer Acceptance" open={Boolean(approvingOffer)} onCancel={() => { if (!saving) { setApprovingOffer(null); setExplicitConsent(false); } }} onOk={handleApprove} confirmLoading={saving} okText="Confirm & Place Order" okButtonProps={{ disabled: !explicitConsent, type: 'primary' }} width={650}>
        {approvingOffer && (<div style={{ padding: '12px 0' }}>
          <Alert message="Explicit Approval Requirement" description="Per MarketTwin requirements, you must explicitly approve the merchant's final terms before an order is placed." type="info" style={{ marginBottom: 16, background: '#F0F7FF', borderColor: '#BAE0FF' }} />
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Offer Code" span={2}><Text strong style={{ color: '#1677FF' }}>{approvingOffer.offer_code}</Text></Descriptions.Item>
            <Descriptions.Item label="Merchant"><strong>{approvingOffer.merchant_name}</strong> ({approvingOffer.merchant_rating} / 5.0)</Descriptions.Item>
            <Descriptions.Item label="Offered Unit Price"><strong style={{ color: '#52C41A', fontSize: 16 }}>{formatOfferCurrency(approvingOffer.unit_price, approvingOffer.currency)}</strong></Descriptions.Item>
            <Descriptions.Item label="Delivery Window">{approvingOffer.delivery_days} Business Days</Descriptions.Item>
            <Descriptions.Item label="Warranty Term">{approvingOffer.warranty_months} Months Included</Descriptions.Item>
            <Descriptions.Item label="Shipping Terms" span={2}>{approvingOffer.shipping_terms}</Descriptions.Item>
            <Descriptions.Item label="Your Quantity">{approvingOffer.customer_quantity}</Descriptions.Item>
            <Descriptions.Item label="Total">{formatOfferCurrency(customerTotal(approvingOffer), approvingOffer.currency)}</Descriptions.Item>
            <Descriptions.Item label="Specifications" span={2}>{approvingOffer.spec_notes}</Descriptions.Item>
          </Descriptions>
          <div style={{ background: '#FAFBFC', border: '1px solid #DFE1E6', borderRadius: 8, padding: '12px 16px' }}>
            <Checkbox checked={explicitConsent} onChange={(e) => setExplicitConsent(e.target.checked)}><span style={{ fontSize: 13, fontWeight: 600, color: '#172B4D' }}>I have reviewed all specifications and explicitly approve {approvingOffer.merchant_name}'s final offer of {formatOfferCurrency(approvingOffer.unit_price, approvingOffer.currency)} per unit.</span></Checkbox>
          </div>
        </div>)}
      </Modal>
    </div>
  );
};

export default MerchantOffers;