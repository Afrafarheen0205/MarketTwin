import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Input,
  Row,
  Col,
  Typography,
  Table,
  Tag,
  Button,
  Space,
  Alert,
  Divider,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined,
  AppstoreAddOutlined,
  ThunderboltOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

export const ProductSearch: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('products').select('*');
      setProducts(data ?? []);
    };
    load();
  }, []);

  const searchResults = products.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.category.toLowerCase().includes(query.toLowerCase()) ||
    p.sku.toLowerCase().includes(query.toLowerCase())
  );

  const columns: ColumnsType<any> = [
    {
      title: 'Product',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space>
          <img src={record.image} alt={name} style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 600 }}>{name}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>SKU: {record.sku}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (cat) => <Tag color="blue">{cat}</Tag>,
    },
    {
      title: 'Retail Price',
      dataIndex: 'marketPrice',
      key: 'marketPrice',
      render: (p) => <span style={{ fontWeight: 600 }}>${p}</span>,
    },
    {
      title: 'Demand Group Target',
      dataIndex: 'minDemandPrice',
      key: 'minDemandPrice',
      render: (target) => <span style={{ color: '#52C41A', fontWeight: 700 }}>from ${target}</span>,
    },
    {
      title: 'Active Demand Pools',
      dataIndex: 'activeDemandsCount',
      key: 'activeDemandsCount',
      render: (count) => (
        <Tag color="cyan" icon={<ThunderboltOutlined />}>
          {count} Active Demands
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/customer/products/${record.id}`)}
          >
            Details
          </Button>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<AppstoreAddOutlined />}
            onClick={() => navigate(`/customer/demands/create?product=${encodeURIComponent(record.name)}`)}
          >
            Create Demand
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 24 }}>
        <Title level={4} style={{ margin: 0, color: '#172B4D' }}>
          Smart Product & Demand Search
        </Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 16px 0', fontSize: 13 }}>
          Search existing products. If a suitable product or volume tier is unavailable, MarketTwin empowers you to submit product demands directly to our merchant bidding network.
        </Paragraph>

        <Search
          placeholder="Search by keywords, model, industry specs (e.g. Ergonomic, Solar, 4K, Commercial)..."
          size="large"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterButton="Search Catalog"
          prefix={<SearchOutlined style={{ color: '#6B778C' }} />}
          style={{ maxWidth: 700 }}
        />
      </Card>

      {/* Demand CTA Alert */}
      <Alert
        message="Can't find what you need?"
        description="If your required product isn't listed, create a demand! Other buyers with similar requirements will be grouped with you to trigger bulk merchant bids."
        type="info"
        showIcon
        action={
          <Button
            type="primary"
            size="small"
            icon={<AppstoreAddOutlined />}
            onClick={() => navigate('/customer/demands/create')}
          >
            Create Demand Now
          </Button>
        }
        style={{ background: '#F0F7FF', borderColor: '#BAE0FF' }}
      />

      {/* Results Table */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Search Results ({searchResults.length} matches)</span>
            <Text type="secondary" style={{ fontSize: 12 }}>Showing items matching your query</Text>
          </div>
        }
        bordered
      >
        <Table
          columns={columns}
          dataSource={searchResults}
          rowKey="id"
          pagination={{ pageSize: 6 }}
        />
      </Card>
    </div>
  );
};

export default ProductSearch;
