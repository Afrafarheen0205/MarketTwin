import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Progress, Button, Space, Typography, Input, Select, Row, Col, Modal, Descriptions, Badge, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AppstoreAddOutlined, SearchOutlined, EyeOutlined, TagsOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { fetchDemands } from '../../services/demandService';

const { Title, Text } = Typography;

export const MyDemands: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [demands, setDemands] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewingDemand, setViewingDemand] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) { setLoading(false); return; }
      try { setDemands(await fetchDemands(user.id)); } finally { setLoading(false); }
    };
    load();
  }, [user]);

  const filteredDemands = demands.filter((d) => {
    const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase()) || d.demand_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns: ColumnsType<any> = [
    { title: 'Demand Code', dataIndex: 'demand_code', key: 'demand_code', render: (code) => <Text strong style={{ color: '#1677FF' }}>{code}</Text> },
    { title: 'Title & Category', dataIndex: 'title', key: 'title', render: (title, record) => (<div><div style={{ fontWeight: 600 }}>{title}</div><Tag color="blue" style={{ marginTop: 2 }}>{record.category}</Tag></div>) },
    { title: 'Target Price', dataIndex: 'target_price', key: 'target_price', render: (price, record) => (<div><span style={{ fontWeight: 600, color: '#172B4D' }}>${price}</span><span style={{ fontSize: 11, color: '#8993A4', textDecoration: 'line-through', marginLeft: 6 }}>${record.market_price}</span></div>) },
    { title: 'Volume', dataIndex: 'target_quantity', key: 'target_quantity', render: (qty) => <span>{qty} units</span> },
    { title: 'Group Progress', key: 'groupProgress', render: (_, record) => { const percent = record.group_threshold ? Math.min(Math.round((record.current_group_quantity / record.group_threshold) * 100), 100) : 0; return (<div style={{ width: 140 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span>{record.current_group_quantity}/{record.group_threshold}</span><span style={{ fontWeight: 600 }}>{percent}%</span></div><Progress percent={percent} size="small" strokeColor="#1677FF" showInfo={false} /></div>); } },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (status) => { let color = 'default'; if (status === 'Grouped') color = 'blue'; if (status === 'Offers Received') color = 'gold'; if (status === 'Approved') color = 'green'; return <Tag color={color}>{status}</Tag>; } },
    { title: 'Offers', dataIndex: 'offers_count', key: 'offers_count', render: (count) => (<Badge count={count ?? 0} showZero style={{ backgroundColor: (count ?? 0) > 0 ? '#1677FF' : '#DFE1E6', color: (count ?? 0) > 0 ? '#FFFFFF' : '#6B778C' }} />) },
    { title: 'Actions', key: 'actions', render: (_, record) => (<Space><Button size="small" icon={<EyeOutlined />} onClick={() => setViewingDemand(record)}>Specs</Button><Button size="small" type="primary" ghost icon={<TagsOutlined />} onClick={() => navigate('/customer/offers')}>Offers</Button></Space>) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: '20px 24px' }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={16}><Title level={4} style={{ margin: 0, color: '#172B4D' }}>My Product Demands</Title><Text type="secondary" style={{ fontSize: 13 }}>Track demand aggregation, group volume thresholds, and merchant offer submissions.</Text></Col>
          <Col xs={24} sm={8} style={{ textAlign: 'right' }}><Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => navigate('/customer/demands/create')}>Create New Demand</Button></Col>
        </Row>
      </Card>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}><Input placeholder="Search demands by code or title..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} prefix={<SearchOutlined style={{ color: '#8993A4' }} />} allowClear /></Col>
          <Col xs={12} sm={6} md={6}><Select style={{ width: '100%' }} value={statusFilter} onChange={(val) => setStatusFilter(val)} options={[{ label: 'All Statuses', value: 'all' }, { label: 'Pending', value: 'Pending' }, { label: 'Grouped', value: 'Grouped' }, { label: 'Offers Received', value: 'Offers Received' }, { label: 'Approved', value: 'Approved' }]} /></Col>
          <Col xs={12} sm={6} md={10} style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: 13 }}>Total Demands: <strong>{filteredDemands.length}</strong></Text></Col>
        </Row>
      </Card>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 0 }}>
        {filteredDemands.length === 0 ? <Empty description="No data available yet" style={{ padding: 40 }} /> : <Table columns={columns} dataSource={filteredDemands} rowKey="id" pagination={{ pageSize: 6 }} loading={loading} />}
      </Card>
      <Modal title={`Demand Specification: ${viewingDemand?.demand_code}`} open={Boolean(viewingDemand)} onCancel={() => setViewingDemand(null)} footer={[<Button key="close" onClick={() => setViewingDemand(null)}>Close</Button>, <Button key="offers" type="primary" onClick={() => { setViewingDemand(null); navigate('/customer/offers'); }}>View Received Offers</Button>]} width={680}>
        {viewingDemand && (<Descriptions bordered column={2} size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="Demand Title" span={2}><strong>{viewingDemand.title}</strong></Descriptions.Item>
          <Descriptions.Item label="Category"><Tag color="blue">{viewingDemand.category}</Tag></Descriptions.Item>
          <Descriptions.Item label="Status"><Tag color="gold">{viewingDemand.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Target Unit Price"><strong style={{ color: '#52C41A' }}>${viewingDemand.target_price}</strong></Descriptions.Item>
          <Descriptions.Item label="Retail Market Price"><span style={{ textDecoration: 'line-through' }}>${viewingDemand.market_price}</span></Descriptions.Item>
          <Descriptions.Item label="Requested Quantity"><strong>{viewingDemand.target_quantity} units</strong></Descriptions.Item>
          <Descriptions.Item label="Group Quantity"><strong>{viewingDemand.current_group_quantity} / {viewingDemand.group_threshold} units</strong></Descriptions.Item>
          <Descriptions.Item label="Created Date">{viewingDemand.created_at}</Descriptions.Item>
          <Descriptions.Item label="Target Deadline">{viewingDemand.deadline}</Descriptions.Item>
          <Descriptions.Item label="Detailed Specs" span={2}><p style={{ margin: 0, fontSize: 13 }}>{viewingDemand.description}</p></Descriptions.Item>
        </Descriptions>)}
      </Modal>
    </div>
  );
};

export default MyDemands;