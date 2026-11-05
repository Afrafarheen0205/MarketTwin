import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Button, Table, Tag, Progress, Typography, Space, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AppstoreAddOutlined, ShoppingOutlined, TeamOutlined, TagsOutlined, ArrowRightOutlined, CheckCircleOutlined, DollarOutlined, ThunderboltOutlined, DiffOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import demandApi from '../../api/demandApi';
import { fetchDemandGroups } from '../../services/demandService';
import { fetchOffers } from '../../services/offerService';
import { fetchOrders } from '../../services/orderService';

const { Title, Text, Paragraph } = Typography;

export const CustomerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [demands, setDemands] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) { setLoading(false); return; }
      try {
        const demandsRes = await demandApi.listDemands();
        const [g, o, ord] = await Promise.all([
          fetchDemandGroups(),
          fetchOffers(),
          fetchOrders({ customerId: user.id }),
        ]);
        setDemands(demandsRes.items || []);
        setGroups(g);
        setOffers(o);
        setOrders(ord);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const activeDemands = demands.filter((d) => d.status !== 'Completed');
  const pendingOffers = offers.filter((o) => o.status === 'Under Review');

  const columns: ColumnsType<any> = [
    { title: 'Demand Code', dataIndex: 'demand_code', key: 'demand_code', render: (text) => <Text strong style={{ color: '#1677FF' }}>{text}</Text> },
    { title: 'Product Title', dataIndex: 'product_name', key: 'title', render: (text, record) => (<div><div style={{ fontWeight: 600 }}>{text}</div><Text type="secondary" style={{ fontSize: 12 }}>{record.category}</Text></div>) },
    { title: 'Target Price / Unit', dataIndex: 'target_unit_price', key: 'target_price', render: (val, record) => (<div><span style={{ fontWeight: 600, color: '#172B4D' }}>${val}</span><span style={{ fontSize: 11, color: '#6B778C', textDecoration: 'line-through', marginLeft: 6 }}>${record.market_price}</span></div>) },
    { title: 'Group Progress', key: 'groupProgress', render: (_, record) => { const percent = record.group_threshold ? Math.min(Math.round((record.current_group_quantity / record.group_threshold) * 100), 100) : 0; return (<div style={{ width: 140 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}><span>{record.current_group_quantity} / {record.group_threshold} units</span><span style={{ fontWeight: 600 }}>{percent}%</span></div><Progress percent={percent} size="small" strokeColor="#1677FF" showInfo={false} /></div>); } },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (status: string) => { let color = 'default'; if (status === 'Grouped') color = 'blue'; if (status === 'Offers Received') color = 'gold'; if (status === 'Approved') color = 'green'; return <Tag color={color}>{status}</Tag>; } },
    { title: 'Offers', dataIndex: 'offers_count', key: 'offers_count', render: (count: number) => (<span>{count ?? 0}</span>) },
    { title: 'Action', key: 'action', render: () => (<Button type="link" size="small" onClick={() => navigate('/customer/offers')}>View Offers</Button>) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F7FF 100%)', borderColor: '#BAE0FF', boxShadow: '0 2px 8px rgba(22, 119, 255, 0.06)' }} styles={{ body: { padding: '24px 28px' } }}>
        <Row align="middle" justify="space-between" gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <Space orientation="vertical" size={4}>
              <Tag color="blue" icon={<ThunderboltOutlined />} style={{ fontWeight: 600 }}>CUSTOMER PORTAL &bull; DEMAND AGGREGATION</Tag>
              <Title level={3} style={{ margin: 0, color: '#172B4D' }}>Welcome back!</Title>
              <Paragraph type="secondary" style={{ margin: 0, fontSize: 14 }}>Your custom demands are matched with other buyers to unlock wholesale bulk pricing from verified merchants.</Paragraph>
            </Space>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Space size={12}>
              <Button type="primary" icon={<AppstoreAddOutlined />} size="large" onClick={() => navigate('/customer/demands/create')}>Create New Demand</Button>
              <Button icon={<ShoppingOutlined />} size="large" onClick={() => navigate('/customer/catalogue')}>Browse Catalog</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {pendingOffers.length > 0 && (
        <Alert message={<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}><div><strong>Merchant Offers Waiting for Your Review</strong></div><Button type="primary" size="small" icon={<DiffOutlined />} onClick={() => navigate('/customer/compare')}>Compare Offers Now</Button></div>} type="info" showIcon style={{ background: '#E6F4FF', borderColor: '#91CAFF' }} />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><Card variant="outlined" hoverable styles={{ body: { padding: 20 } }}><Statistic title={<Text type="secondary" style={{ fontSize: 13 }}>My Active Demands</Text>} value={activeDemands.length} prefix={<AppstoreAddOutlined style={{ color: '#1677FF', marginRight: 8 }} />} styles={{ content: { fontWeight: 700, color: '#172B4D' } }} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card variant="outlined" hoverable styles={{ body: { padding: 20 } }}><Statistic title={<Text type="secondary" style={{ fontSize: 13 }}>Joined Demand Groups</Text>} value={groups.length} prefix={<TeamOutlined style={{ color: '#52C41A', marginRight: 8 }} />} styles={{ content: { fontWeight: 700, color: '#172B4D' } }} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card variant="outlined" hoverable styles={{ body: { padding: 20 } }}><Statistic title={<Text type="secondary" style={{ fontSize: 13 }}>Received Merchant Offers</Text>} value={offers.length} prefix={<TagsOutlined style={{ color: '#FAAD14', marginRight: 8 }} />} styles={{ content: { fontWeight: 700, color: '#172B4D' } }} /></Card></Col>
        <Col xs={24} sm={12} lg={6}><Card variant="outlined" hoverable styles={{ body: { padding: 20 } }}><Statistic title={<Text type="secondary" style={{ fontSize: 13 }}>Orders</Text>} value={orders.length} prefix={<DollarOutlined style={{ color: '#722ED1', marginRight: 4 }} />} styles={{ content: { fontWeight: 700, color: '#172B4D' } }} /></Card></Col>
      </Row>

      <Card title={<Space><AppstoreAddOutlined style={{ color: '#1677FF' }} /><span style={{ fontSize: 16, fontWeight: 600 }}>My Demands & Group Progress</span></Space>} variant="outlined">
        {activeDemands.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#6B778C' }}>No data available yet</div> : <Table columns={columns} dataSource={activeDemands} rowKey="id" pagination={false} size="middle" loading={loading} />}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title={<Space><TeamOutlined style={{ color: '#1677FF' }} /><span style={{ fontSize: 15, fontWeight: 600 }}>Active Demand Groups Near You</span></Space>} variant="outlined" extra={<Button type="link" onClick={() => navigate('/customer/groups')}>Explore Groups</Button>}>
            {groups.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#6B778C' }}>No data available yet</div> : <Row gutter={[12, 12]}>{groups.slice(0, 2).map((group) => (<Col xs={24} sm={12} key={group.id}><Card size="small" style={{ background: '#FAFBFC', borderColor: '#EBECF0', borderRadius: 8 }} styles={{ body: { padding: 16 } }}><div style={{ fontWeight: 600, fontSize: 14, margin: '8px 0 4px 0', color: '#172B4D' }}>{group.product_title}</div><div style={{ fontSize: 12, color: '#6B778C', marginBottom: 12 }}>{group.participants_count} buyers</div></Card></Col>))}</Row>}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<Space><ThunderboltOutlined style={{ color: '#FAAD14' }} /><span style={{ fontSize: 15, fontWeight: 600 }}>How MarketTwin Works</span></Space>} variant="outlined">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {['Create Custom Demand', 'Auto Demand Grouping', 'Competitive Merchant Bids', 'Explicit Buyer Approval'].map((step, i) => (<div key={step} style={{ display: 'flex', gap: 12 }}><div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#E6F4FF', color: '#1677FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{i + 1}</div><div><div style={{ fontWeight: 600, fontSize: 13 }}>{step}</div></div></div>))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CustomerDashboard;