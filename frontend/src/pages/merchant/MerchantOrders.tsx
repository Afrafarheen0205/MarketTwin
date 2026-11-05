import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Typography, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CarOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { fetchOrders } from '../../services/orderService';
import { supabase } from '../../services/supabase';

const { Title, Text, Paragraph } = Typography;

export const MerchantOrders: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) { setLoading(false); return; }
      try { setOrders(await fetchOrders({ merchantId: user.id })); } finally { setLoading(false); }
    };
    load();
  }, [user]);

  const columns: ColumnsType<any> = [
    { title: 'Order Number', dataIndex: 'order_number', key: 'order_number', render: (num) => <Text strong style={{ color: '#1677FF' }}>{num}</Text> },
    { title: 'Product Title', dataIndex: 'product_name', key: 'product_name', render: (name) => <span style={{ fontWeight: 600 }}>{name}</span> },
    { title: 'Fulfillment Merchant', dataIndex: 'merchant_name', key: 'merchant_name' },
    { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', render: (q) => `${q} units` },
    { title: 'Total Price', dataIndex: 'total_price', key: 'total_price', render: (p) => <span style={{ fontWeight: 700, color: '#172B4D' }}>${Number(p).toLocaleString()}</span> },
    { title: 'Fulfillment Status', dataIndex: 'status', key: 'status', render: (status) => { let color = 'default'; if (status === 'Approved') color = 'blue'; if (status === 'Processing') color = 'gold'; if (status === 'Dispatched') color = 'cyan'; if (status === 'Delivered') color = 'green'; return <Tag color={color}>{status}</Tag>; } },
    { title: 'Actions', key: 'actions', render: (_, record) => (<Space><Button size="small" type="primary" ghost icon={<CarOutlined />} onClick={() => navigate(`/customer/orders/${record.id}/track`)}>Update Status</Button></Space>) },
  ];

  const updateStatus = async (id: string, status: string) => {
    if (!supabase) return;
    await supabase.from('orders').update({ status }).eq('id', id);
    setOrders(orders.map((o) => (o.id === id ? { ...o, status } : o)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: '20px 24px' } }}>
        <Title level={4} style={{ margin: 0, color: '#172B4D' }}>Fulfillment Orders</Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13 }}>Contract orders pipeline with quick status updates.</Paragraph>
      </Card>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 0 } }}>
        {orders.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>No data available yet</div> : <Table columns={columns} dataSource={orders} rowKey="id" pagination={{ pageSize: 6 }} loading={loading} />}
      </Card>
    </div>
  );
};

export default MerchantOrders;