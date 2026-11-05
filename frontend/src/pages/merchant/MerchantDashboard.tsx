import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Button, Table, Tag, Typography, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ShopOutlined, DollarOutlined, TagsOutlined, TeamOutlined, CheckCircleOutlined, ThunderboltOutlined, ArrowRightOutlined, FileDoneOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { fetchDemandGroups } from '../../services/demandService';
import { fetchOffers } from '../../services/offerService';
import { fetchOrders } from '../../services/orderService';

const { Title, Text, Paragraph } = Typography;

export const MerchantDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const [g, o, ord] = await Promise.all([fetchDemandGroups(), fetchOffers({ merchantId: user.id }), fetchOrders({ merchantId: user.id })]);
      setGroups(g); setOffers(o); setOrders(ord);
    };
    load();
  }, [user]);

  const columns: ColumnsType<any> = [
    { title: 'Group Code', dataIndex: 'group_code', key: 'group_code', render: (code) => <Text strong style={{ color: '#1677FF' }}>{code}</Text> },
    { title: 'Aggregated Product Demand', dataIndex: 'product_title', key: 'product_title', render: (title, record) => (<div><div style={{ fontWeight: 600 }}>{title}</div><Text type="secondary" style={{ fontSize: 12 }}>{record.category}</Text></div>) },
    { title: 'Total Volume Pool', dataIndex: 'total_quantity', key: 'total_quantity', render: (qty, record) => (<div><span style={{ fontSize: 14, fontWeight: 700, color: '#172B4D' }}>{qty} units</span><div style={{ fontSize: 11, color: '#6B778C' }}>{record.participants_count} pooled buyers</div></div>) },
    { title: 'Target Price / Unit', dataIndex: 'lowest_offer_price', key: 'lowest_offer_price', render: (p) => <span style={{ color: '#52C41A', fontWeight: 700 }}>${p}</span> },
    { title: 'Bidding Status', dataIndex: 'status', key: 'status', render: (status) => { let color = 'gold'; if (status === 'Reviewing Offers') color = 'green'; if (status === 'Finalized') color = 'blue'; return <Tag color={color}>{status}</Tag>; } },
    { title: 'Action', key: 'action', render: (_, record) => (<Button type="primary" size="small" onClick={() => navigate(`/merchant/demands/${record.id}`)}>Submit Offer</Button>) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFBE6 100%)', borderColor: '#FFE58F', boxShadow: '0 2px 8px rgba(250, 173, 20, 0.08)' }} styles={{ body: { padding: '24px 28px' } }}>
        <Row align="middle" justify="space-between" gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <Space orientation="vertical" size={4}>
              <Tag color="orange" icon={<ShopOutlined />} style={{ fontWeight: 600 }}>MERCHANT SUPPLY PORTAL &bull; DEMAND BIDDING</Tag>
              <Title level={3} style={{ margin: 0, color: '#172B4D' }}>Welcome, Merchant</Title>
              <Paragraph type="secondary" style={{ margin: 0, fontSize: 14 }}>Access pre-aggregated customer demand pools. Submit competitive offers to win high-volume bulk supply contracts.</Paragraph>
            </Space>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Button type="primary" size="large" icon={<TagsOutlined />} onClick={() => navigate('/merchant/demands')}>Browse Open Demands</Button>
          </Col>
        </Row>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><Card variant="outlined" hoverable styles={{ body: { padding: 20 } }}><Statistic title={<Text type="secondary" style={{ fontSize: 13 }}>Submitted Offers</Text>} value={offers.length} prefix={<TagsOutlined style={{ color: '#1677FF', marginRight: 6 }} />} styles={{ content: { fontWeight: 700, color: '#172B4D' } }} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card variant="outlined" hoverable styles={{ body: { padding: 20 } }}><Statistic title={<Text type="secondary" style={{ fontSize: 13 }}>Open Demand Pools</Text>} value={groups.length} prefix={<TeamOutlined style={{ color: '#FAAD14', marginRight: 6 }} />} styles={{ content: { fontWeight: 700, color: '#172B4D' } }} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card variant="outlined" hoverable styles={{ body: { padding: 20 } }}><Statistic title={<Text type="secondary" style={{ fontSize: 13 }}>Fulfillment Orders</Text>} value={orders.length} prefix={<FileDoneOutlined style={{ color: '#722ED1', marginRight: 6 }} />} styles={{ content: { fontWeight: 700, color: '#172B4D' } }} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card variant="outlined" hoverable styles={{ body: { padding: 20 } }}><Statistic title={<Text type="secondary" style={{ fontSize: 13 }}>Trust Score</Text>} value={4.9} suffix="/ 5.0" prefix={<CheckCircleOutlined style={{ color: '#52C41A', marginRight: 6 }} />} styles={{ content: { fontWeight: 700, color: '#172B4D' } }} /></Card></Col>
      </Row>
      <Card title={<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Space><TeamOutlined style={{ color: '#1677FF' }} /><span style={{ fontSize: 16, fontWeight: 600 }}>Active Customer Demand Pools Ready for Bids</span></Space><Button type="link" size="small" onClick={() => navigate('/merchant/demands')}>View All Open Demands <ArrowRightOutlined /></Button></div>} variant="outlined">
        {groups.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#6B778C' }}>No data available yet</div> : <Table columns={columns} dataSource={groups} rowKey="id" pagination={false} size="middle" />}
      </Card>
    </div>
  );
};

export default MerchantDashboard;