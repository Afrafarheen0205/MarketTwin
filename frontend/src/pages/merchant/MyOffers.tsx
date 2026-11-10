import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Card, Table, Tag, Button, Space, Typography, Modal, InputNumber, message, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { TagsOutlined, EditOutlined, CarOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { fetchOffers, formatOfferCurrency, isCurrencyAvailable, reviseOffer, offerError, type MerchantOffer } from '../../services/offerService';

const { Title, Text, Paragraph } = Typography;

export const MyOffers: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [offers, setOffers] = useState<MerchantOffer[]>([]);
  const [revisingOffer, setRevisingOffer] = useState<MerchantOffer | null>(null);
  const [newPrice, setNewPrice] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const loadOffers = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try { setOffers(await fetchOffers()); setError(null); }
    catch (failure) { setError(offerError(failure)); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadOffers(); }, [user]);

  const handleRevise = async () => {
    if (!revisingOffer || Number(newPrice) <= 0 || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await reviseOffer(revisingOffer, newPrice);
      message.success(`Offer ${revisingOffer.offer_code} revised.`);
      setRevisingOffer(null);
      await loadOffers();
    } catch (failure) { message.error(offerError(failure)); }
    finally { inFlight.current = false; setSaving(false); }
  };

  const columns: ColumnsType<MerchantOffer> = [
    { title: 'Offer Code', dataIndex: 'offer_code', key: 'offer_code', render: (code) => <Text strong style={{ color: '#1677FF' }}>{code}</Text> },
    { title: 'Demand Pool', dataIndex: 'demand_title', key: 'demand_title', render: (title) => <span style={{ fontWeight: 500 }}>{title}</span> },
    { title: 'Offered Price', dataIndex: 'unit_price', key: 'unit_price', render: (price, record) => <span style={{ fontSize: 15, fontWeight: 700, color: '#172B4D' }}>{formatOfferCurrency(price, record.currency)}</span> },
    { title: 'Delivery Lead Time', dataIndex: 'delivery_days', key: 'delivery_days', render: (days) => `${days} business days` },
    { title: 'Warranty', dataIndex: 'warranty_months', key: 'warranty_months', render: (months) => `${months} months` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (status) => { let color = 'default'; if (status === 'Submitted') color = 'blue'; if (status === 'Under Review') color = 'gold'; if (status === 'Customer Approved') color = 'green'; return <Tag color={color}>{status}</Tag>; } },
    { title: 'Quoted Quantity', dataIndex: 'quoted_quantity', render: quantity => quantity ?? 'Not recorded' },
    { title: 'Quoted Total', dataIndex: 'total_offer_amount', render: (total, record) => total == null ? 'Not recorded' : formatOfferCurrency(total, record.currency) },
    { title: 'Actions', key: 'actions', render: (_, record) => (<Space>{['Submitted', 'Under Review'].includes(record.status) && record.quoted_quantity != null && (<Button size="small" icon={<EditOutlined />} disabled={!isCurrencyAvailable(record.currency)} title={!isCurrencyAvailable(record.currency) ? 'Currency unavailable; this offer cannot be safely revised.' : undefined} onClick={() => { setRevisingOffer(record); setNewPrice(String(record.unit_price)); }}>Revise Price</Button>)}<Button size="small" icon={<CarOutlined />} onClick={() => navigate('/merchant/orders')}>Orders</Button></Space>) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <Alert type="error" title={error} showIcon action={<Button onClick={loadOffers}>Retry</Button>} />}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: '20px 24px' } }}>
        <Title level={4} style={{ margin: 0, color: '#172B4D' }}>My Submitted Offers</Title>
        <Text type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13, display: 'block' }}>Track your active bids, revise pricing, and manage approved contracts awaiting fulfillment.</Text>
      </Card>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 0 } }}>
        {offers.length === 0 ? <Empty description="No data available yet" style={{ padding: 40 }} /> : <Table columns={columns} dataSource={offers} rowKey="id" pagination={{ pageSize: 6 }} loading={loading} />}
      </Card>
      <Modal title={`Revise Offer: ${revisingOffer?.offer_code}`} open={Boolean(revisingOffer)} onCancel={() => { if (!saving) setRevisingOffer(null); }} onOk={handleRevise} confirmLoading={saving} okButtonProps={{ disabled: !newPrice || Number(newPrice) <= 0 }} okText="Update Bid">
        {revisingOffer && (<div style={{ padding: '8px 0' }}>
          <Paragraph>Update your wholesale unit price for <strong>{revisingOffer.demand_title}</strong>.</Paragraph>
          <Paragraph>Quoted quantity: {revisingOffer.quoted_quantity} units</Paragraph>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}><span>New Unit Price ({isCurrencyAvailable(revisingOffer.currency) ? revisingOffer.currency.toUpperCase() : 'currency unavailable'}):</span><InputNumber stringMode min="0.01" max="9999999999.99" precision={2} value={newPrice} disabled={saving || !isCurrencyAvailable(revisingOffer.currency)} onChange={(val) => setNewPrice(val || '')} size="large" /></div>
        </div>)}
      </Modal>
    </div>
  );
};

export default MyOffers;