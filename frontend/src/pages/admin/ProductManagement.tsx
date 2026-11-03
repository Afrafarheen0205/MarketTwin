import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Row,
  Col,
  Typography,
  Table,
  Input,
  Select,
  Space,
  Dropdown,
  Modal,
  Form,
  InputNumber,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  SyncOutlined,
  QuestionCircleOutlined,
  DownOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  PlusOutlined,
  ShoppingOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

export const ProductManagement: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('products').select('*');
      setProducts(data ?? []);
    };
    load();
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('Today');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [syncing, setSyncing] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [form] = Form.useForm();

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.success('Product catalogue master inventory synchronized.');
    }, 600);
  };

  const handleAddProduct = (values: any) => {
    const newProd: any = {
      id: `prod-${Date.now()}`,
      name: values.name,
      category: values.category,
      sku: values.sku,
      description: values.description || 'Enterprise catalog SKU',
      marketPrice: values.marketPrice,
      minDemandPrice: Math.round(values.marketPrice * 0.75),
      rating: 5.0,
      reviewsCount: 0,
      inStock: true,
      image: 'https://images.unsplash.com/photo-1580481077195-c3a82da91883?auto=format&fit=crop&w=400&q=80',
      specs: { Standard: 'Commercial Standard' },
      activeDemandsCount: 0,
    };
    setProducts([newProd, ...products]);
    message.success('New catalog product added successfully.');
    setIsAddModalOpen(false);
    form.resetFields();
  };

  const filtered = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'all' || p.category.toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesCat;
  });

  const columns: ColumnsType<any> = [
    {
      title: 'Product Title',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space size={12} align="center">
          <img
            src={record.image}
            alt={name}
            style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #E2E8F0' }}
          />
          <div>
            <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{name}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>
              <span style={{ fontWeight: 600, color: '#2563EB' }}>{record.sku}</span> &bull; {record.category}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Sector</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'category',
      key: 'category',
      render: (c) => <span style={{ fontWeight: 500, color: '#172B4D' }}>{c}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Retail Price</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'marketPrice',
      key: 'marketPrice',
      render: (p) => <span style={{ fontWeight: 600, color: '#172B4D' }}>${p}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Demand Target</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'minDemandPrice',
      key: 'minDemandPrice',
      render: (p) => <span style={{ color: '#059669', fontWeight: 700, fontSize: 13.5 }}>${p}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Active Demand Pools</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'activeDemandsCount',
      key: 'activeDemandsCount',
      render: (cnt) => (
        <span
          style={{
            backgroundColor: '#EFF6FF',
            color: '#2563EB',
            borderRadius: 14,
            padding: '2px 10px',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {cnt} Demands
        </span>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      align: 'right',
      render: (_, record) => (
        <button
          onClick={() => navigate(`/customer/products/${record.id}`)}
          style={{
            backgroundColor: '#0A101D',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 18,
            padding: '5px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1E293B')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0A101D')}
        >
          View Specs
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* 1. Header (Overview + Sync / Help / Time Filter) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#172B4D', letterSpacing: -0.5 }}>
            Product Catalog Governance
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Manage commercial product inventory, baseline retail prices, and demand pooling thresholds
          </Text>
        </div>

        <Space size={10} align="center">
          <button
            onClick={handleSync}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 20,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <span>Sync</span>
            <SyncOutlined spin={syncing} style={{ fontSize: 12, color: '#64748B' }} />
          </button>

          <button
            onClick={() =>
              message.info(
                'Product Governance: Set pricing baselines that trigger automated group demand creation when retail quotes exceed target bounds.'
              )
            }
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <QuestionCircleOutlined style={{ fontSize: 14 }} />
          </button>

          <Dropdown
            menu={{
              items: [
                { key: 'today', label: 'Today', onClick: () => setTimeRange('Today') },
                { key: 'week', label: 'This Week', onClick: () => setTimeRange('This Week') },
                { key: 'month', label: 'This Month', onClick: () => setTimeRange('This Month') },
                { key: 'all', label: 'All Time', onClick: () => setTimeRange('All Time') },
              ],
            }}
            placement="bottomRight"
          >
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 20,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: '#334155',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <span>{timeRange}</span>
              <DownOutlined style={{ fontSize: 10, color: '#94A3B8' }} />
            </button>
          </Dropdown>
        </Space>
      </div>

      {/* 2. Top 4 Metric KPI Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Total Catalog SKUs</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{products.length}</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 16,
                  padding: '2px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#059669' }} />
                • Active SKUs
              </span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Avg. Discount Spread</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>28.5%</span>
              <span
                style={{
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  borderRadius: 16,
                  padding: '2px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                + Group Margin
              </span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Active Product Demands</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>8</span>
              <span style={{ color: '#64748B', fontSize: 13 }}>pools</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 16,
                  padding: '2px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <ArrowUpOutlined style={{ fontSize: 10 }} /> High Volume
              </span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Supplier Network</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>3</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 16,
                  padding: '2px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Tier 1 Ready
              </span>
            </div>
          </div>
        </Col>
      </Row>

      {/* 3. Main Data Card: Product Catalog */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 14,
          padding: '24px 24px 20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {/* Controls Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#0F172A' }}>Catalog Master Items</span>

            <div
              style={{
                display: 'inline-flex',
                background: '#F1F5F9',
                borderRadius: 20,
                padding: 3,
                gap: 2,
              }}
            >
              <button
                onClick={() => setViewMode('list')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: viewMode === 'list' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'list' ? '#0F172A' : '#64748B',
                  borderRadius: 18,
                  padding: '4px 12px',
                  fontSize: 12.5,
                  fontWeight: viewMode === 'list' ? 600 : 500,
                  cursor: 'pointer',
                  boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <UnorderedListOutlined style={{ fontSize: 12 }} />
                <span>List View</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: viewMode === 'grid' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'grid' ? '#0F172A' : '#64748B',
                  borderRadius: 18,
                  padding: '4px 12px',
                  fontSize: 12.5,
                  fontWeight: viewMode === 'grid' ? 600 : 500,
                  cursor: 'pointer',
                  boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <AppstoreOutlined style={{ fontSize: 12 }} />
                <span>Grid View</span>
              </button>
            </div>
          </div>

          <Space size={10}>
            <button
              onClick={() => setIsAddModalOpen(true)}
              style={{
                backgroundColor: '#0A101D',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 20,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <PlusOutlined style={{ fontSize: 11 }} />
              <span>Add New Product</span>
            </button>

            <button
              onClick={() => navigate('/admin/dashboard')}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                border: '1px solid #CBD5E1',
                borderRadius: 20,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Overview
            </button>
          </Space>
        </div>

        {/* 5 Filter Pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Input
              placeholder="Search products by title or SKU"
              prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                borderRadius: 20,
                borderColor: '#E2E8F0',
                height: 38,
                fontSize: 13,
                backgroundColor: '#FFFFFF',
              }}
              allowClear
            />
          </div>

          <Select
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
            style={{ width: 170 }}
            className="filter-pill-select"
            options={[
              { label: 'Category: All Sectors', value: 'all' },
              { label: 'Office Furniture', value: 'Office Furniture' },
              { label: 'Renewable Energy', value: 'Renewable Energy' },
              { label: 'Electronics & IT', value: 'Electronics' },
            ]}
          />

          <Select
            defaultValue="all"
            style={{ width: 160 }}
            className="filter-pill-select"
            options={[
              { label: 'Price: All Ranges', value: 'all' },
              { label: 'Over $500', value: 'high' },
              { label: 'Under $500', value: 'mid' },
            ]}
          />

          <Select
            defaultValue="all"
            style={{ width: 150 }}
            className="filter-pill-select"
            options={[
              { label: 'Demands: Active', value: 'all' },
            ]}
          />
        </div>

        {/* View Layouts */}
        {viewMode === 'list' ? (
          <Table
            columns={columns}
            dataSource={filtered}
            rowKey="id"
            pagination={false}
            size="middle"
            className="market-offers-table"
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filtered.map((item) => (
              <Col xs={24} sm={12} lg={8} key={item.id}>
                <div
                  style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 16,
                    background: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid #E2E8F0' }}
                      />
                      <div>
                        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>SKU: {item.sku}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{item.name}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginBottom: 4 }}>
                      ${item.minDemandPrice}{' '}
                      <span style={{ fontSize: 12, color: '#94A3B8', textDecoration: 'line-through' }}>
                        ${item.marketPrice}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                      Category: {item.category} &bull; {item.activeDemandsCount} Active Demands
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/customer/products/${item.id}`)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0A101D',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 16,
                      padding: '7px 0',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    View Specs & Demands
                  </button>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* Add Product Modal */}
      <Modal
        title="Add New Catalog SKU"
        open={isAddModalOpen}
        onCancel={() => setIsAddModalOpen(false)}
        onOk={() => form.submit()}
        okText="Save Product"
      >
        <Form form={form} layout="vertical" onFinish={handleAddProduct} style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Product Title" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Ergonomic Executive Task Chair" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'Office Furniture', value: 'Office Furniture' },
                    { label: 'Renewable Energy', value: 'Renewable Energy' },
                    { label: 'Electronics & IT', value: 'Electronics' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sku" label="SKU Code" rules={[{ required: true }]}>
                <Input placeholder="e.g. SKU-OFF-099" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="marketPrice" label="Retail Catalog Baseline ($)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={10} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Commercial specifications" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductManagement;
