import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Typography, Input, Select, Row, Col, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined, ThunderboltOutlined, FileAddOutlined, EyeOutlined } from '@ant-design/icons';
import { fetchDemandGroups } from '../../services/demandService';

const { Title, Text, Paragraph } = Typography;

export const AvailableDemands: React.FC = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => { try { setGroups(await fetchDemandGroups()); } finally { setLoading(false); } };
    load();
  }, []);

  const filtered = groups.filter((g) => {
    const matchesSearch = g.product_title.toLowerCase().includes(searchTerm.toLowerCase()) || g.group_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'all' || g.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const columns: ColumnsType<any> = [
    { title: 'Group Reference', dataIndex: 'group_code', key: 'group_code', render: (code) => <Text strong style={{ color: '#1677FF' }}>{code}</Text> },
    { title: 'Product Title', dataIndex: 'product_title', key: 'product_title', render: (title, record) => (<div><div style={{ fontWeight: 600 }}>{title}</div><Tag color="blue" style={{ marginTop: 2 }}>{record.category}</Tag></div>) },
    { title: 'Group Demand Volume', dataIndex: 'total_quantity', key: 'total_quantity', render: (qty, record) => (<div><span style={{ fontSize: 14, fontWeight: 700, color: '#172B4D' }}>{qty} units</span><div style={{ fontSize: 11, color: '#6B778C' }}>Threshold: {record.threshold_quantity}</div></div>) },
    { title: 'Buyer Price Target', dataIndex: 'lowest_offer_price', key: 'lowest_offer_price', render: (p) => <span style={{ color: '#52C41A', fontWeight: 700 }}>${p}/unit</span> },
    { title: 'Active Bids', dataIndex: 'offers_count', key: 'offers_count', render: (count) => <span>{count ?? 0} Merchant Bids</span> },
    { title: 'Fulfillment Deadline', dataIndex: 'deadline', key: 'deadline' },
    { title: 'Actions', key: 'actions', render: (_, record) => (<Space><Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/merchant/demands/${record.id}`)}>Specs</Button><Button size="small" type="primary" icon={<FileAddOutlined />} onClick={() => navigate(`/merchant/offers/submit?group=${record.id}`)}>Submit Bid</Button></Space>) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: '20px 24px' }}>
        <Title level={4} style={{ margin: 0, color: '#172B4D' }}>Available Customer Demand Pools</Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13 }}>Verified buyer groups with aggregated purchasing power. Submit competitive proposals detailing your wholesale pricing, logistics lead times, and warranty terms.</Paragraph>
      </Card>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}><Input placeholder="Search demand pools..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} prefix={<SearchOutlined style={{ color: '#8993A4' }} />} allowClear /></Col>
          <Col xs={12} sm={6} md={6}><Select style={{ width: '100%' }} value={categoryFilter} onChange={(val) => setCategoryFilter(val)} options={[{ label: 'All Categories', value: 'all' }, { label: 'Office Furniture', value: 'Office Furniture' }, { label: 'Renewable Energy', value: 'Renewable Energy' }, { label: 'Commercial Kitchen', value: 'Commercial Kitchen' }, { label: 'Food & Beverage', value: 'Food & Beverage' }]} /></Col>
          <Col xs={12} sm={6} md={10} style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: 13 }}>Available Demand Pools: <strong>{filtered.length}</strong></Text></Col>
        </Row>
      </Card>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 0 }}>
        {filtered.length === 0 ? <Empty description="No data available yet" style={{ padding: 40 }} /> : <Table columns={columns} dataSource={filtered} rowKey="id" pagination={{ pageSize: 6 }} loading={loading} />}
      </Card>
    </div>
  );
};

export default AvailableDemands;