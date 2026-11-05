import React, { useEffect, useState, useCallback } from 'react';
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
  Button,
  Tag,
  Switch,
  Upload,
  Card,
  Popconfirm,
  Badge,
  Spin,
  Empty,
  Tooltip,
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
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { productApi, Product, CreateProductPayload } from '../../api/productApi';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const ProductManagement: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [timeRange, setTimeRange] = useState('All Time');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // Load products from FastAPI backend
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productApi.adminListProducts({ page: 1, page_size: 100 });
      setProducts(res.items);
    } catch (err: any) {
      console.error('Failed to load admin products:', err);
      message.error(err.message || 'Unable to load products from database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await loadProducts();
      message.success('Product catalogue master inventory synchronized.');
    } finally {
      setSyncing(false);
    }
  };

  // Add Product Submit Handler
  const handleAddProduct = async (values: any) => {
    setSubmitting(true);
    try {
      // Parse specifications
      let specifications: Record<string, any> = {};
      if (values.specsRaw) {
        try {
          specifications = JSON.parse(values.specsRaw);
        } catch {
          // Parse lines like Key: Value
          values.specsRaw.split('\n').forEach((line: string) => {
            const [k, ...v] = line.split(':');
            if (k && v.length) specifications[k.trim()] = v.join(':').trim();
          });
        }
      }

      const payload: CreateProductPayload = {
        name: values.name.trim(),
        category: values.category.trim(),
        brand: values.brand?.trim() || '',
        model_number: values.model_number?.trim() || '',
        description: values.description?.trim() || '',
        retail_price: Number(values.retail_price),
        wholesale_price: Number(values.wholesale_price),
        minimum_order_quantity: Number(values.minimum_order_quantity || 1),
        available_quantity: Number(values.available_quantity || 0),
        unit: values.unit?.trim() || 'piece',
        specifications,
        images: values.image_url ? [values.image_url.trim()] : [],
        status: values.status ? 'active' : 'inactive',
      };

      await productApi.adminCreateProduct(payload);
      message.success('New catalog product added to database successfully.');
      setIsAddModalOpen(false);
      addForm.resetFields();
      await loadProducts();
    } catch (err: any) {
      console.error('Failed to create product:', err);
      message.error(err.message || 'Failed to create product.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    const specsString = product.specifications
      ? Object.entries(product.specifications)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
      : '';

    editForm.setFieldsValue({
      name: product.name,
      category: product.category,
      brand: product.brand,
      model_number: product.model_number || product.sku,
      unit: product.unit,
      retail_price: product.retail_price ?? product.market_price,
      wholesale_price: product.wholesale_price ?? product.min_demand_price,
      minimum_order_quantity: product.minimum_order_quantity ?? 1,
      available_quantity: product.available_quantity ?? 0,
      description: product.description,
      status: product.status === 'active',
      specsRaw: specsString,
    });
    setIsEditModalOpen(true);
  };

  // Edit Product Submit Handler
  const handleEditProduct = async (values: any) => {
    if (!editingProduct) return;
    setSubmitting(true);
    try {
      let specifications: Record<string, any> = {};
      if (values.specsRaw) {
        try {
          specifications = JSON.parse(values.specsRaw);
        } catch {
          values.specsRaw.split('\n').forEach((line: string) => {
            const [k, ...v] = line.split(':');
            if (k && v.length) specifications[k.trim()] = v.join(':').trim();
          });
        }
      }

      const payload: Partial<CreateProductPayload> = {
        name: values.name.trim(),
        category: values.category.trim(),
        brand: values.brand?.trim() || '',
        model_number: values.model_number?.trim() || '',
        description: values.description?.trim() || '',
        retail_price: Number(values.retail_price),
        wholesale_price: Number(values.wholesale_price),
        minimum_order_quantity: Number(values.minimum_order_quantity || 1),
        available_quantity: Number(values.available_quantity || 0),
        unit: values.unit?.trim() || 'piece',
        specifications,
        status: values.status ? 'active' : 'inactive',
      };

      await productApi.adminUpdateProduct(editingProduct.id, payload);
      message.success('Product updated successfully in database.');
      setIsEditModalOpen(false);
      setEditingProduct(null);
      await loadProducts();
    } catch (err: any) {
      console.error('Failed to update product:', err);
      message.error(err.message || 'Failed to update product.');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Active/Inactive Status
  const handleToggleStatus = async (product: Product, checked: boolean) => {
    const newStatus = checked ? 'active' : 'inactive';
    try {
      await productApi.adminUpdateProduct(product.id, { status: newStatus });
      message.success(`Product ${checked ? 'activated' : 'deactivated'} successfully.`);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: newStatus } : p))
      );
    } catch (err: any) {
      message.error(err.message || 'Failed to update product status.');
    }
  };

  // Delete / Deactivate Product
  const handleDeleteProduct = async (productId: string, hardDelete: boolean = false) => {
    try {
      await productApi.adminDeleteProduct(productId, hardDelete);
      message.success(hardDelete ? 'Product permanently deleted.' : 'Product deactivated successfully.');
      await loadProducts();
    } catch (err: any) {
      message.error(err.message || 'Failed to delete product.');
    }
  };

  // Upload Image Handler to Supabase Storage
  const handleImageUpload = async (file: File) => {
    if (!editingProduct) {
      message.warning('Please save or select a product before uploading image.');
      return false;
    }
    setUploadingImage(true);
    try {
      const res = await productApi.adminUploadProductImage(editingProduct.id, file);
      message.success('Product photo uploaded to Supabase Storage!');
      setEditingProduct((prev) => (prev ? { ...prev, images: res.images } : null));
      await loadProducts();
    } catch (err: any) {
      message.error(err.message || 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
    return false; // Prevent automatic form submission
  };

  // Filter products
  const filtered = products.filter((p) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(s) ||
      (p.model_number || p.sku || '').toLowerCase().includes(s) ||
      p.category.toLowerCase().includes(s) ||
      (p.brand || '').toLowerCase().includes(s);
    const matchesCat = categoryFilter === 'all' || p.category.toLowerCase() === categoryFilter.toLowerCase();
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && p.status === 'active') ||
      (statusFilter === 'inactive' && p.status === 'inactive');
    return matchesSearch && matchesCat && matchesStatus;
  });

  // Calculate live KPI metrics
  const totalSKUs = products.length;
  const activeCount = products.filter((p) => p.status === 'active').length;
  const totalStock = products.reduce((acc, p) => acc + (p.available_quantity || 0), 0);
  const avgMargin =
    products.length > 0
      ? Math.round(
          products.reduce((acc, p) => {
            const retail = p.retail_price ?? p.market_price ?? 0;
            const wholesale = p.wholesale_price ?? p.min_demand_price ?? 0;
            return retail > 0 ? acc + ((retail - wholesale) / retail) * 100 : acc;
          }, 0) / products.length
        )
      : 25;

  const distinctCategories = ['all', ...Array.from(new Set(products.map((p) => p.category)))];

  const columns: ColumnsType<Product> = [
    {
      title: 'Product Title',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Product) => {
        const img =
          record.images?.[0] ||
          record.image_url ||
          'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=120&q=80';
        return (
          <Space size={14} align="center">
            <img
              src={img}
              alt={name}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                objectFit: 'cover',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
              }}
            />
            <div>
              <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{name}</div>
              <div style={{ fontSize: 11.5, color: '#64748B' }}>
                <span style={{ fontWeight: 600, color: '#2563EB' }}>
                  {record.model_number || record.sku}
                </span>
                {record.brand && ` • ${record.brand}`}
              </div>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Sector',
      dataIndex: 'category',
      key: 'category',
      render: (c: string) => (
        <Tag color="blue" style={{ borderRadius: 12, fontWeight: 500 }}>
          {c}
        </Tag>
      ),
    },
    {
      title: 'Retail Price',
      key: 'retail_price',
      render: (_: any, r: Product) => {
        const val = r.retail_price ?? r.market_price ?? 0;
        return <span style={{ fontWeight: 600, color: '#172B4D' }}>${val.toFixed(2)}</span>;
      },
    },
    {
      title: 'Wholesale Target',
      key: 'wholesale_price',
      render: (_: any, r: Product) => {
        const val = r.wholesale_price ?? r.min_demand_price ?? 0;
        return <span style={{ color: '#059669', fontWeight: 700, fontSize: 13.5 }}>${val.toFixed(2)}</span>;
      },
    },
    {
      title: 'MOQ / Stock',
      key: 'stock',
      render: (_: any, r: Product) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#172B4D' }}>
            MOQ: {r.minimum_order_quantity ?? 1} {r.unit ?? 'units'}
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            Stock: {r.available_quantity ?? 0} {r.unit ?? 'units'}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: any, r: Product) => (
        <Switch
          checked={r.status === 'active'}
          checkedChildren="Active"
          unCheckedChildren="Inactive"
          onChange={(checked) => handleToggleStatus(r, checked)}
        />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      align: 'right',
      render: (_: any, record: Product) => (
        <Space size={6}>
          <Tooltip title="View Product Page">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/customer/products/${record.id}`)}
              style={{ borderRadius: 6 }}
            />
          </Tooltip>
          <Tooltip title="Edit Product">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              style={{ borderRadius: 6 }}
            />
          </Tooltip>
          <Popconfirm
            title="Deactivate or Delete?"
            description="Do you want to soft-deactivate this product or delete it permanently?"
            okText="Delete Permanently"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteProduct(record.id, true)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              style={{ borderRadius: 6 }}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* 1. Top Governance Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#172B4D', letterSpacing: -0.5 }}>
            Product Catalog Governance
          </Title>
          <Text type="secondary" style={{ fontSize: 13, color: '#64748B' }}>
            Manage commercial product inventory, baseline retail prices, and demand pooling thresholds backed by Supabase
          </Text>
        </div>

        <Space size={10} align="center">
          <Button
            onClick={handleSync}
            icon={<SyncOutlined spin={syncing} />}
            style={{ borderRadius: 20, fontWeight: 500, borderColor: '#E2E8F0' }}
          >
            Sync Live DB
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              addForm.resetFields();
              setIsAddModalOpen(true);
            }}
            style={{ background: '#1677FF', borderRadius: 20, fontWeight: 600 }}
          >
            Add New Product
          </Button>
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
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{totalSKUs}</span>
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
                <CheckCircleOutlined style={{ fontSize: 11 }} /> {activeCount} Live
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Demand Volume Baseline</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{avgMargin}%</span>
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
                Avg Pool Discount
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Warehouse Stock</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{totalStock}</span>
              <span style={{ color: '#64748B', fontSize: 13 }}>units</span>
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Database Status</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#059669', lineHeight: 1 }}>ONLINE</span>
              <Tag color="green" style={{ borderRadius: 12 }}>Supabase Live</Tag>
            </div>
          </div>
        </Col>
      </Row>

      {/* 3. Main Data Card: Product Catalog Table */}
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
            <span style={{ fontSize: 13, color: '#64748B' }}>
              Showing {filtered.length} of {products.length} products
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Search Input */}
            <Input
              placeholder="Search by title, SKU, brand..."
              prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
              style={{ width: 240, borderRadius: 20 }}
            />

            {/* Category Filter */}
            <Select
              value={categoryFilter}
              onChange={(v) => setCategoryFilter(v)}
              style={{ width: 180 }}
              options={distinctCategories.map((c) => ({
                label: c === 'all' ? 'All Sectors' : c,
                value: c,
              }))}
            />

            {/* Status Filter */}
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              style={{ width: 130 }}
              options={[
                { label: 'All Status', value: 'all' },
                { label: 'Active Only', value: 'active' },
                { label: 'Inactive Only', value: 'inactive' },
              ]}
            />
          </div>
        </div>

        {/* Data Table */}
        <Table<Product>
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showTotal: (tot) => `Total ${tot} master products` }}
        />
      </div>

      {/* MODAL 1: ADD PRODUCT */}
      <Modal
        title={<Title level={4} style={{ margin: 0, color: '#172B4D' }}>Add Catalog Product</Title>}
        open={isAddModalOpen}
        onCancel={() => setIsAddModalOpen(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddProduct} initialValues={{ status: true, minimum_order_quantity: 1, available_quantity: 50, unit: 'piece' }}>
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item name="name" label="Product Name" rules={[{ required: true, message: 'Please enter product title' }]}>
                <Input placeholder="e.g. Industrial Edge Compute Gateway" />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="category" label="Taxonomy Category" rules={[{ required: true, message: 'Please enter category' }]}>
                <Input placeholder="e.g. Industrial Hardware" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={12} md={8}>
              <Form.Item name="brand" label="Manufacturer / Brand">
                <Input placeholder="e.g. AcuEdge" />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="model_number" label="Model Number / SKU">
                <Input placeholder="e.g. AE-GW-9000X" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="unit" label="Unit Type">
                <Input placeholder="e.g. piece, set, module" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Form.Item name="retail_price" label="Retail Catalog Price ($)" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="349.00" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="wholesale_price" label="Target Wholesale ($)" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="245.00" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="minimum_order_quantity" label="Minimum Order Qty (MOQ)">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="available_quantity" label="Warehouse Stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="image_url" label="Primary Image URL">
            <Input placeholder="https://images.unsplash.com/... or upload in Edit modal" />
          </Form.Item>

          <Form.Item name="description" label="Detailed Technical Description">
            <TextArea rows={3} placeholder="Provide engineering and compliance characteristics..." />
          </Form.Item>

          <Form.Item name="specsRaw" label="Technical Specifications (JSON or Key: Value per line)">
            <TextArea rows={3} placeholder={'Processor: Quad-Core ARM\nOperating Temp: -40C to +85C\nIngress: IP67 Certified'} />
          </Form.Item>

          <Form.Item name="status" label="Initial Status" valuePropName="checked">
            <Switch checkedChildren="Active (Visible in Catalogue)" unCheckedChildren="Inactive (Hidden)" />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={submitting} style={{ background: '#1677FF' }}>
                Save Product to Database
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* MODAL 2: EDIT PRODUCT & IMAGE UPLOAD */}
      <Modal
        title={<Title level={4} style={{ margin: 0, color: '#172B4D' }}>Edit Product & Manage Imagery</Title>}
        open={isEditModalOpen}
        onCancel={() => {
          setIsEditModalOpen(false);
          setEditingProduct(null);
        }}
        footer={null}
        width={760}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditProduct}>
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item name="name" label="Product Name" rules={[{ required: true, message: 'Please enter product title' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="category" label="Taxonomy Category" rules={[{ required: true, message: 'Please enter category' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={12} md={8}>
              <Form.Item name="brand" label="Manufacturer / Brand">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="model_number" label="Model Number / SKU">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="unit" label="Unit Type">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Form.Item name="retail_price" label="Retail Catalog Price ($)" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="wholesale_price" label="Target Wholesale ($)" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="minimum_order_quantity" label="Minimum Order Qty (MOQ)">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="available_quantity" label="Warehouse Stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* Supabase Storage Upload Box */}
          <Card
            size="small"
            style={{
              background: '#F8FAFC',
              borderColor: '#E2E8F0',
              borderRadius: 8,
              marginBottom: 18,
            }}
            title={
              <span style={{ fontSize: 13, fontWeight: 600, color: '#172B4D' }}>
                Supabase Storage Product Images
              </span>
            }
          >
            {editingProduct?.images && editingProduct.images.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
                {editingProduct.images.map((img, idx) => (
                  <div
                    key={idx}
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: '1px solid #CBD5E1',
                      flexShrink: 0,
                    }}
                  >
                    <img src={img} alt={`img-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            )}
            <Upload
              beforeUpload={(file) => {
                handleImageUpload(file);
                return false;
              }}
              showUploadList={false}
              accept="image/*"
            >
              <Button icon={<UploadOutlined />} loading={uploadingImage} style={{ borderRadius: 6 }}>
                Upload New Image to Supabase Storage
              </Button>
            </Upload>
          </Card>

          <Form.Item name="description" label="Detailed Technical Description">
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item name="specsRaw" label="Technical Specifications (Key: Value per line)">
            <TextArea rows={3} />
          </Form.Item>

          <Form.Item name="status" label="Active Status" valuePropName="checked">
            <Switch checkedChildren="Active (Visible in Catalogue)" unCheckedChildren="Inactive (Hidden)" />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingProduct(null);
                }}
              >
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={submitting} style={{ background: '#1677FF' }}>
                Update Product
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductManagement;
