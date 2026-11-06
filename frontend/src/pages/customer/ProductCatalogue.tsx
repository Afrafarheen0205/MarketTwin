import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Row,
  Col,
  Card,
  Input,
  Select,
  Button,
  Tag,
  Rate,
  Typography,
  Space,
  Empty,
  Alert,
  Skeleton,
  Pagination,
  InputNumber,
  Badge,
  Divider,
} from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  AppstoreAddOutlined,
  ThunderboltOutlined,
  SortAscendingOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { productApi, Product } from '../../api/productApi';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

export const ProductCatalogue: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'popular'>('newest');
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch Categories on Mount
  useEffect(() => {
    productApi
      .getCategories()
      .then((cats) => setCategories(['all', ...cats]))
      .catch((err) => console.error('Failed to load categories:', err));
  }, []);

  // Fetch Products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await productApi.getProducts({
        page,
        page_size: pageSize,
        search: searchTerm.trim() || undefined,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        min_price: minPrice,
        max_price: maxPrice,
        sort_by: sortBy,
      });
      setProducts(res.items);
      setTotalCount(res.total);
    } catch (err: any) {
      console.error('Error loading catalogue products:', err);
      setErrorMsg(err.message || 'Unable to connect to catalogue service.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, selectedCategory, minPrice, maxPrice, sortBy]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setSortBy('newest');
    setPage(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Header Hero Card */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} styles={{ body: { padding: '22px 28px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={15}>
            <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
              Standard Product Catalogue
            </Title>
            <Paragraph type="secondary" style={{ margin: '6px 0 0 0', fontSize: 13.5, color: '#6B778C' }}>
              Browse verified commercial catalog inventory backed by live PostgreSQL database records. If your required model, custom spec, or volume tier is unavailable, initiate a targeted Demand pool to attract supplier bids.
            </Paragraph>
          </Col>
          <Col xs={24} md={9} style={{ textAlign: 'right' }}>
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

      {/* 2. Interactive Search & Multi-Filter Bar */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} styles={{ body: { padding: '18px 24px' } }}>
        <Row gutter={[16, 16]} align="middle">
          {/* Keyword Search */}
          <Col xs={24} sm={12} md={7}>
            <Search
              placeholder="Search by title, brand, or model..."
              allowClear
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              prefix={<SearchOutlined style={{ color: '#8993A4' }} />}
              size="middle"
            />
          </Col>

          {/* Category Dropdown */}
          <Col xs={12} sm={6} md={5}>
            <Select
              style={{ width: '100%' }}
              value={selectedCategory}
              onChange={(val) => {
                setSelectedCategory(val);
                setPage(1);
              }}
              options={categories.map((c) => ({
                label: c === 'all' ? 'All Categories' : c,
                value: c,
              }))}
              suffixIcon={<FilterOutlined style={{ color: '#8993A4' }} />}
            />
          </Col>

          {/* Price Range Filters */}
          <Col xs={12} sm={6} md={4}>
            <Space size={4} orientation="horizontal" style={{ width: '100%' }}>
              <InputNumber
                placeholder="Min $"
                min={0}
                value={minPrice}
                onChange={(v) => {
                  setMinPrice(v ?? undefined);
                  setPage(1);
                }}
                style={{ width: '100%' }}
              />
              <span style={{ color: '#8993A4' }}>-</span>
              <InputNumber
                placeholder="Max $"
                min={0}
                value={maxPrice}
                onChange={(v) => {
                  setMaxPrice(v ?? undefined);
                  setPage(1);
                }}
                style={{ width: '100%' }}
              />
            </Space>
          </Col>

          {/* Sort By */}
          <Col xs={16} sm={8} md={5}>
            <Select
              style={{ width: '100%' }}
              value={sortBy}
              onChange={(val) => {
                setSortBy(val);
                setPage(1);
              }}
              options={[
                { label: 'Newest Arrivals', value: 'newest' },
                { label: 'Price: Low to High', value: 'price_asc' },
                { label: 'Price: High to Low', value: 'price_desc' },
                { label: 'Highest Rated', value: 'popular' },
              ]}
              suffixIcon={<SortAscendingOutlined style={{ color: '#8993A4' }} />}
            />
          </Col>

          {/* Reset Filters & Count */}
          <Col xs={8} sm={4} md={3} style={{ textAlign: 'right' }}>
            <Button
              type="text"
              icon={<ClearOutlined />}
              onClick={handleResetFilters}
              style={{ color: '#6B778C', fontSize: 12.5 }}
            >
              Reset
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 3. Demand-Driven Advisory Banner */}
      <Alert
        message={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>
              <ThunderboltOutlined style={{ color: '#1677FF', marginRight: 8, fontSize: 16 }} />
              <strong>Demand-Driven Tip:</strong> Pool orders with peer buyers to hit supplier minimum order quantities (MOQ) and unlock wholesale prices up to 35% lower than catalog retail.
            </span>
            <Button size="small" type="link" onClick={() => navigate('/customer/demands/create')} style={{ fontWeight: 600 }}>
              Start a Demand Pool &rarr;
            </Button>
          </div>
        }
        type="info"
        style={{ background: '#F0F7FF', borderColor: '#BAE0FF', borderRadius: 8 }}
      />

      {errorMsg && (
        <Alert
          message="Catalogue Error"
          description={errorMsg}
          type="error"
          showIcon
          closable
          onClose={() => setErrorMsg(null)}
        />
      )}

      {/* 4. Products Display */}
      {loading ? (
        <Row gutter={[20, 20]}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={idx}>
              <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 8 }}>
                <Skeleton.Image style={{ width: '100%', height: 180, borderRadius: 6 }} active />
                <Skeleton active paragraph={{ rows: 3 }} style={{ marginTop: 16 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : products.length > 0 ? (
        <>
          <Row gutter={[20, 20]}>
            {products.map((product) => {
              const imageSrc =
                product.images?.[0] ||
                product.image_url ||
                'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80';
              const retailPrice = product.retail_price ?? product.market_price ?? 0;
              const wholesalePrice = product.wholesale_price ?? product.min_demand_price ?? Math.round(retailPrice * 0.75);
              const discountPct = retailPrice > 0 ? Math.round(((retailPrice - wholesalePrice) / retailPrice) * 100) : 0;
              const inStock = product.status === 'active' && (product.available_quantity ?? 0) > 0;

              return (
                <Col xs={24} sm={12} lg={8} xl={6} key={product.id}>
                  <Card
                    hoverable
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      background: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: 10,
                      overflow: 'hidden',
                      transition: 'all 0.25s ease',
                    }}
                    cover={
                      <div
                        style={{
                          position: 'relative',
                          height: 190,
                          overflow: 'hidden',
                          background: '#F8FAFC',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderBottom: '1px solid #F1F5F9',
                        }}
                      >
                        <img
                          alt={product.name}
                          src={imageSrc}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <Tag
                          color={inStock ? 'success' : 'warning'}
                          style={{
                            position: 'absolute',
                            top: 10,
                            right: 8,
                            margin: 0,
                            fontWeight: 600,
                            borderRadius: 12,
                          }}
                        >
                          {inStock ? 'In Stock' : 'Demand Only'}
                        </Tag>
                        {discountPct > 0 && (
                          <Tag
                            color="blue"
                            style={{
                              position: 'absolute',
                              top: 10,
                              left: 8,
                              margin: 0,
                              fontWeight: 700,
                              borderRadius: 12,
                            }}
                          >
                            Save {discountPct}%
                          </Tag>
                        )}
                      </div>
                    }
                    styles={{
                      body: {
                        padding: '16px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                      },
                    }}
                  >
                    {/* Category & Brand */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                        {product.category}
                      </span>
                      {product.brand && (
                        <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>
                          {product.brand}
                        </span>
                      )}
                    </div>

                    {/* Product Name */}
                    <div
                      style={{
                        fontSize: 14.5,
                        fontWeight: 600,
                        color: '#172B4D',
                        marginTop: 6,
                        marginBottom: 6,
                        height: 42,
                        overflow: 'hidden',
                        lineHeight: '21px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                      title={product.name}
                    >
                      {product.name}
                    </div>

                    {/* Model Number & Ratings */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Rate disabled defaultValue={product.rating ?? 4.9} style={{ fontSize: 12, color: '#FAAD14' }} />
                        <span style={{ fontSize: 11.5, color: '#64748B' }}>({product.reviews_count ?? 18})</span>
                      </div>
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>
                        MOQ: {product.minimum_order_quantity ?? 1} {product.unit ?? 'units'}
                      </span>
                    </div>

                    {/* Pricing Matrix */}
                    <div
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        padding: '10px 12px',
                        borderRadius: 8,
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 11.5, color: '#64748B' }}>Retail Catalog:</span>
                        <span style={{ fontSize: 14.5, fontWeight: 700, color: '#172B4D' }}>
                          ${retailPrice.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                        <span style={{ fontSize: 11.5, color: '#2563EB', fontWeight: 600 }}>
                          Group Demand Target:
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>
                          from ${wholesalePrice.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                      <Button
                        type="default"
                        style={{
                          flex: 1,
                          borderRadius: 6,
                          fontWeight: 500,
                          borderColor: '#CBD5E1',
                        }}
                        icon={<EyeOutlined />}
                        onClick={() => navigate(`/customer/products/${product.id}`)}
                      >
                        Details
                      </Button>
                      <Button
                        type="primary"
                        ghost
                        style={{
                          flex: 1,
                          borderRadius: 6,
                          fontWeight: 600,
                          borderColor: '#1677FF',
                          color: '#1677FF',
                        }}
                        icon={<AppstoreAddOutlined />}
                        onClick={() => navigate(`/customer/demands/create?product=${encodeURIComponent(product.name)}`)}
                      >
                        Demand
                      </Button>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={totalCount}
              showTotal={(total, range) => `Showing ${range[0]}-${range[1]} of ${total} products`}
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
              showSizeChanger
              pageSizeOptions={['12', '24', '48']}
            />
          </div>
        </>
      ) : (
        <Card style={{ background: '#FFFFFF', textAlign: 'center', padding: '52px 20px', borderColor: '#E2E8F0', borderRadius: 10 }}>
          <Empty
            description={
              <div style={{ maxWidth: 560, margin: '0 auto' }}>
                <Title level={4} style={{ margin: '12px 0 6px 0', color: '#172B4D', fontWeight: 700 }}>
                  No Products Match Your Requirements
                </Title>
                <Text type="secondary" style={{ color: '#64748B', fontSize: 13.5, display: 'block' }}>
                  {searchTerm
                    ? `No catalogue items match your search for "${searchTerm}". You can create a targeted demand pool to invite verified supplier bids.`
                    : 'No catalogue items match the specified category and price criteria. Adjust filters or initiate a custom demand.'}
                </Text>
                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 12 }}>
                  <Button
                    type="primary"
                    icon={<AppstoreAddOutlined />}
                    size="large"
                    onClick={() =>
                      navigate(
                        `/customer/demands/create?product=${encodeURIComponent(
                          searchTerm
                        )}&category=${encodeURIComponent(
                          selectedCategory !== 'all' ? selectedCategory : ''
                        )}`
                      )
                    }
                    style={{ borderRadius: 8, fontWeight: 600, background: '#1677FF' }}
                  >
                    Create Product Demand for "{searchTerm || selectedCategory}"
                  </Button>
                  <Button size="large" onClick={handleResetFilters} icon={<ClearOutlined />} style={{ borderRadius: 8 }}>
                    Clear Requirements
                  </Button>
                </div>
              </div>
            }
          />
        </Card>
      )}
    </div>
  );
};

export default ProductCatalogue;
