import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Typography, Modal, InputNumber, message, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { TagsOutlined, EditOutlined, CarOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import axiosClient from '../../api/axiosClient';
import { supabase } from '../../services/supabase';

const { Title, Text, Paragraph } = Typography;

export const MyOffers: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const [revisingOffer, setRevisingOffer] = useState<any | null>(null);
  const [newPrice, setNewPrice] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const loadOffers = async () => {
    if (!user) { setLoading(false); return; }
    try { const res = await axiosClient.get('/api/v1/merchant/offers'); setOffers(res.data.items || []); } finally { setLoading(false); }
  };

  useEffect(() => { loadOffers(); }, [user]);

  const handleRevise = async () => {
    if (!revisingOffer || newPrice <= 0 || !supabase) return;
    await supabase.from('merchant_offers').update({ unit_price: newPrice, total_offer_amount: newPrice * 10 }).eq('id', revisingOffer.id);
    message.success(`Offer ${revisingOffer.offer_code} revised to $${newPrice}/unit.`);
    setRevisingOffer(null);
    loadOffers();
  };

  const columns: ColumnsType<any> = [
    { title: 'Offer Code', dataIndex: 'offer_code', key: 'offer_code', render: (code) => <Text strong style={{ color: '#1677FF' }}>{code}</Text> },
    { title: 'Demand Pool', dataIndex: 'demand_title', key: 'demand_title', render: (title) => <span style={{ fontWeight: 500 }}>{title}</span> },
    { title: 'Offered Price', dataIndex: 'unit_price', key: 'unit_price', render: (price) => <span style={{ fontSize: 15, fontWeight: 700, color: '#172B4D' }}>${price}</span> },
    { title: 'Delivery Lead Time', dataIndex: 'delivery_days', key: 'delivery_days', render: (days) => `${days} business days` },
    { title: 'Warranty', dataIndex: 'warranty_months', key: 'warranty_months', render: (months) => `${months} months` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (status) => { let color = 'default'; if (status === 'Submitted') color = 'blue'; if (status === 'Under Review') color = 'gold'; if (status === 'Customer Approved') color = 'green'; return <Tag color={color}>{status}</Tag>; } },
    { title: 'Actions', key: 'actions', render: (_, record) => (<Space>{record.status !== 'Customer Approved' && (<Button size="small" icon={<EditOutlined />} onClick={() => { setRevisingOffer(record); setNewPrice(record.unit_price); }}>Revise Price</Button>)}{record.status === 'Customer Approved' && (<Button size="small" type="primary" ghost icon={<CarOutlined />} onClick={() => navigate('/merchant/orders')}>Fulfill Order</Button>)}</Space>) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: '20px 24px' } }}>
        <Title level={4} style={{ margin: 0, color: '#172B4D' }}>My Submitted Offers</Title>
        <Text type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13, display: 'block' }}>Track your active bids, revise pricing, and manage approved contracts awaiting fulfillment.</Text>
      </Card>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 0 } }}>
        {offers.length === 0 ? <Empty description="No data available yet" style={{ padding: 40 }} /> : <Table columns={columns} dataSource={offers} rowKey="id" pagination={{ pageSize: 6 }} loading={loading} />}
      </Card>
      <Modal title={`Revise Offer: ${revisingOffer?.offer_code}`} open={Boolean(revisingOffer)} onCancel={() => setRevisingOffer(null)} onOk={handleRevise} okText="Update Bid">
        {revisingOffer && (<div style={{ padding: '8px 0' }}>
          <Paragraph>Update your wholesale unit price for <strong>{revisingOffer.demand_title}</strong>.</Paragraph>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span>New Unit Price ($):</span><InputNumber min={1} value={newPrice} onChange={(val) => setNewPrice(val || 0)} size="large" /></div>
        </div>)}
      </Modal>
    </div>
  );
};

export default MyOffers;