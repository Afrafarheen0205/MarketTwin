import React, { useEffect, useState, useCallback } from 'react';
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
  Spin,
  Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined,
  AppstoreAddOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { productApi, Product } from '../../api/productApi';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

export const ProductSearch: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchResults = useCallback(async (searchQuery: string) => {
    setLoading(true);
    try {
      const res = await productApi.getProducts({
        search: searchQuery.trim() || undefined,
        page_size: 50,
      });
      setProducts(res.items);
    } catch (err) {
      console.error('Failed to search products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults(query);
  }, [query, fetchResults]);

  const columns: ColumnsType<Product> = [
    {
      title: 'Product Title',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Product) => {
        const img =
          record.images?.[0] ||
          record.image_url ||
          'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=200&q=80';
        return (
          <Space size={14} align="center">
            <img
              src={img}
              alt={name}
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                objectFit: 'cover',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
              }}
            />
            <div>
              <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 14 }}>{name}</div>
              <div style={{ fontSize: 11.5, color: '#64748B' }}>
                <span style={{ fontWeight: 600, color: '#2563EB' }}>{record.model_number || record.sku}</span>
                {record.brand && ` • ${record.brand}`}
              </div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => (
        <Tag color="blue" style={{ borderRadius: 12, fontWeight: 500, padding: '2px 10px' }}>
          {cat}
        </Tag>
      ),
    },
    {
      title: 'Retail Price',
      dataIndex: 'retail_price',
      key: 'retail_price',
      render: (_: any, r: Product) => {
        const val = r.retail_price ?? r.market_price ?? 0;
        return <span style={{ fontWeight: 600, color: '#172B4D', fontSize: 14 }}>${val.toFixed(2)}</span>;
      },
    },
    {
      title: 'Group Target Price',
      dataIndex: 'wholesale_price',
      key: 'wholesale_price',
      render: (_: any, r: Product) => {
        const val = r.wholesale_price ?? r.min_demand_price ?? 0;
        return (
          <span style={{ color: '#059669', fontWeight: 700, fontSize: 14 }}>
            from ${val.toFixed(2)}
          </span>
        );
      },
    },
    {
      title: 'MOQ / Stock',
      key: 'inventory',
      render: (_: any, r: Product) => (
        <div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
            MOQ: {r.minimum_order_quantity ?? 1} {r.unit ?? 'units'}
          </span>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            {r.status === 'active' ? (
              <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircleOutlined style={{ fontSize: 11 }} /> Available
              </span>
            ) : (
              <span style={{ color: '#D97706' }}>Custom Demand</span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Action',
      key: 'actions',
      align: 'right',
      render: (_: any, record: Product) => (
        <Space size={8}>
          <Button
            size="middle"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/customer/products/${record.id}`)}
            style={{ borderRadius: 6, fontWeight: 500 }}
          >
            Details
          </Button>
          <Button
            size="middle"
            type="primary"
            icon={<AppstoreAddOutlined />}
            onClick={() => navigate(`/customer/demands/create?product=${encodeURIComponent(record.name)}`)}
            style={{ borderRadius: 6, background: '#1677FF', fontWeight: 600 }}
          >
            Demand
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Banner */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} bodyStyle={{ padding: '22px 28px' }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
              Smart Commercial Product Search
            </Title>
            <Paragraph type="secondary" style={{ margin: '6px 0 0 0', fontSize: 13.5, color: '#6B778C' }}>
              Query catalog items across model numbers, technical specifications, and brand certifications.
            </Paragraph>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              size="large"
              icon={<AppstoreAddOutlined />}
              onClick={() => navigate('/customer/demands/create')}
              style={{ background: '#1677FF', borderRadius: 8, fontWeight: 600 }}
            >
              Can't Find? Create Demand
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Search Input Bar */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} bodyStyle={{ padding: '18px 24px' }}>
        <Search
          placeholder="Search by title, brand, model number (e.g. AE-GW-9000X, FM-US-620)..."
          allowClear
          enterButton="Search Products"
          size="large"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={(val) => fetchResults(val)}
          prefix={<SearchOutlined style={{ color: '#8993A4', marginRight: 6 }} />}
        />
      </Card>

      {/* Results Table */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} bodyStyle={{ padding: 0 }}>
        <Table<Product>
          columns={columns}
          dataSource={products}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showTotal: (total) => `Total ${total} products` }}
          locale={{
            emptyText: (
              <Empty
                description={
                  <div style={{ padding: 20 }}>
                    <Text type="secondary" style={{ color: '#64748B' }}>
                      No matching products found. Try a different keyword or create a demand.
                    </Text>
                  </div>
                }
              />
            ),
          }}
        />
      </Card>
    </div>
  );
};

export default ProductSearch;
