import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Steps, Typography, Descriptions, Tag, Button, Row, Col, Timeline, Divider } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined, CarOutlined, ShopOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

export const OrderTracking: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !id) { setLoading(false); return; }
      const { data } = await supabase.from('orders').select('*').eq('id', id).single();
      setOrder(data);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!order) return <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>No data available yet</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/customer/orders')}>Back to Orders</Button></div>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <Title level={4} style={{ margin: 0, color: '#172B4D' }}>Tracking Order: {order.order_number}</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>Carrier: <strong>{order.carrier}</strong> &bull; Tracking Ref: <Text code>{order.tracking_number}</Text></Text>
          </div>
          <Tag color="blue" style={{ fontSize: 13, padding: '4px 10px' }}>Status: {order.status}</Tag>
        </div>
        <Steps current={order.current_step ?? 0} style={{ margin: '28px 0 36px 0' }} items={[{ title: 'Customer Approved', description: 'Offer explicitly accepted', icon: <SafetyCertificateOutlined /> }, { title: 'Merchant Processing', description: 'Factory batching & QA check', icon: <ShopOutlined /> }, { title: 'Dispatched', description: 'Freight in transit', icon: <CarOutlined /> }, { title: 'Delivered', description: 'Doorstep reception signed', icon: <CheckCircleOutlined /> }]} />
        <Row gutter={[24, 24]}>
          <Col xs={24} md={14}>
            <Title level={5} style={{ marginBottom: 16 }}>Order & Logistics Details</Title>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Order Number">{order.order_number}</Descriptions.Item>
              <Descriptions.Item label="Demand Ref">{order.demand_code}</Descriptions.Item>
              <Descriptions.Item label="Item">{order.product_name}</Descriptions.Item>
              <Descriptions.Item label="Merchant">{order.merchant_name}</Descriptions.Item>
              <Descriptions.Item label="Quantity">{order.quantity} units</Descriptions.Item>
              <Descriptions.Item label="Total Paid">${Number(order.total_price).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="Order Date">{order.order_date}</Descriptions.Item>
              <Descriptions.Item label="Est. Delivery">{order.estimated_delivery}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col xs={24} md={10}>
            <Title level={5} style={{ marginBottom: 16 }}>Live Milestone Timeline</Title>
            <Timeline items={[{ color: 'green', children: (<div><strong>Order Placed & Escrow Funded</strong><div style={{ fontSize: 12, color: '#6B778C' }}>{order.order_date}</div></div>) }, { color: (order.current_step ?? 0) >= 1 ? 'green' : 'gray', children: (<div><strong>Merchant Production & Verification</strong></div>) }, { color: (order.current_step ?? 0) >= 2 ? 'green' : 'gray', children: (<div><strong>Carrier Picked Up Shipment</strong></div>) }, { color: (order.current_step ?? 0) >= 3 ? 'green' : 'gray', children: (<div><strong>Final Delivery & Acceptance Sign-off</strong><div style={{ fontSize: 12, color: '#6B778C' }}>Estimated arrival: {order.estimated_delivery}</div></div>) }]} />
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default OrderTracking;