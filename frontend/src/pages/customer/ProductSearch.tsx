import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Select,
  InputNumber,
  Radio,
  Tooltip,
  Skeleton,
  Pagination,
  Badge,
  Divider,
  Modal,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined,
  AppstoreAddOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ShoppingOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  ClearOutlined,
  AppstoreOutlined,
  BarsOutlined,
  InfoCircleOutlined,
  ArrowRightOutlined,
  FireOutlined,
  SwapOutlined,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { productApi, Product, ProductMatchItem, ProductSearchResponse } from '../../api/productApi';
import { createOrder } from '../../services/orderService';

// Category SVG fallback generator when remote images fail to load
const getCategoryFallbackImage = (category: string) => {
  const c = (category || '').toLowerCase();
  let color1 = '#1677FF', label = 'HARDWARE';
  if (c.includes('energy') || c.includes('power')) {
    color1 = '#FAAD14'; label = 'ENERGY & POWER';
  } else if (c.includes('telecom') || c.includes('network')) {
    color1 = '#52C41A'; label = 'NETWORKING';
  } else if (c.includes('automation') || c.includes('robotics')) {
    color1 = '#722ED1'; label = 'AUTOMATION';
  } else if (c.includes('medical') || c.includes('lab')) {
    color1 = '#EB2F96'; label = 'LAB & MEDICAL';
  } else if (c.includes('instrument')) {
    color1 = '#13C2C2'; label = 'INSTRUMENTS';
  }
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23F8FAFC"/><stop offset="100%" stop-color="%23EDF2F7"/></linearGradient></defs><rect width="400" height="260" fill="url(%23g)"/><rect x="155" y="75" width="90" height="90" rx="16" fill="${color1}" opacity="0.12"/><circle cx="200" cy="120" r="26" stroke="${color1}" stroke-width="3" fill="none" opacity="0.85"/><text x="200" y="195" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="12" font-weight="700" fill="%2364748B" text-anchor="middle" letter-spacing="1.2">${label}</text></svg>`;
};

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

export const ProductSearch: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();

  // Purchase Order State
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [orderProduct, setOrderProduct] = useState<Product | ProductMatchItem | null>(null);
  const [orderQty, setOrderQty] = useState<number>(1);
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  const handleOpenOrderModal = (product: Product | ProductMatchItem) => {
    setOrderProduct(product);
    setOrderQty(product.minimum_order_quantity || 1);
    setOrderModalVisible(true);
  };

  const handleConfirmOrder = async () => {
    if (!orderProduct || !user) {
      message.error('Please log in as a customer to place an order.');
      return;
    }

    setOrderSubmitting(true);
    try {
      const unitPrice =
        orderQty >= 10
          ? orderProduct.wholesale_price || orderProduct.retail_price
          : orderProduct.retail_price;
      const totalAmount = unitPrice * orderQty;

      await createOrder({
        order_number: `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`,
        customer_id: user.id,
        product_id: orderProduct.id,
        product_name: orderProduct.name,
        brand: orderProduct.brand,
        model: orderProduct.model_number,
        unit: orderProduct.unit,
        unit_price: unitPrice,
        product_image: orderProduct.images?.[0] || orderProduct.image_url,
        specs: orderProduct.specifications || (orderProduct as any).specs || {},
        merchant_id: (orderProduct as any).created_by || null,
        merchant_name: orderProduct.brand || null,
        customer_name: profile?.fullName || null,
        customer_email: profile?.email || null,
        customer_phone: profile?.customer?.phone || null,
        quantity: orderQty,
        total_price: totalAmount,
        status: 'Approved',
        order_date: new Date().toISOString().split('T')[0],
      });

      message.success(`Order placed successfully for ${orderQty} ${orderProduct.unit || 'unit'}(s)!`);
      setOrderModalVisible(false);
    } catch (err: any) {
      console.error('Order placement failed:', err);
      message.error(err.message || 'Failed to place order.');
    } finally {
      setOrderSubmitting(false);
    }
  };

  // Query & Filter States
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState<string>(searchParams.get('category') || 'all');
  const [categories, setCategories] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'relevance' | 'price_asc' | 'price_desc' | 'newest'>('relevance');
  const [matchFilter, setMatchFilter] = useState<'all' | 'exact' | 'similar' | 'alternative' | 'related'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Response state
  const [searchResult, setSearchResult] = useState<ProductSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stale request guard ref
  const searchSeqRef = useRef(0);

  // Quick suggestion query pills
  const sampleSuggestions = [
    'IoT Gateway',
    'Ultrasonic Flow Meter',
    'LiFePO4 Energy Module',
    'NEMA 34 Stepper',
    '10G Fiber Switch',
    'Peristaltic Pump',
  ];

  // 1. Fetch categories on mount
  useEffect(() => {
    productApi
      .getCategories()
      .then((cats) => setCategories(['all', ...cats]))
      .catch((err) => console.error('Failed to fetch categories:', err));
  }, []);

  // 2. Debounce search input (400ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 400);

    return () => clearTimeout(handler);
  }, [query]);

  // Check if user has specified any search query or requirement filter
  const hasActiveQuery = Boolean(
    debouncedQuery ||
    (selectedCategory && selectedCategory !== 'all') ||
    minPrice !== undefined ||
    maxPrice !== undefined
  );

  // 3. Core Search Functionality with Stale Response Prevention
  const executeSearch = useCallback(async () => {
    if (!hasActiveQuery) {
      setSearchResult(null);
      setLoading(false);
      return;
    }

    const currentSeq = ++searchSeqRef.current;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await productApi.searchProducts({
        q: debouncedQuery || undefined,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        min_price: minPrice,
        max_price: maxPrice,
        sort: sortOrder,
        page,
        page_size: pageSize,
      });

      // Ignore if a newer search request has already been initiated
      if (currentSeq !== searchSeqRef.current) {
        return;
      }

      setSearchResult(res);
    } catch (err: any) {
      if (currentSeq === searchSeqRef.current) {
        console.error('Product search error:', err);
        setErrorMsg(err.message || 'Unable to complete search request.');
      }
    } finally {
      if (currentSeq === searchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedQuery, selectedCategory, minPrice, maxPrice, sortOrder, page, pageSize]);

  useEffect(() => {
    executeSearch();
  }, [executeSearch]);

  // Filter items by match type if selected
  const displayedItems = (searchResult?.items || []).filter((item) => {
    if (matchFilter === 'exact') return item.match_type === 'exact';
    if (matchFilter === 'similar') return item.match_type === 'similar';
    if (matchFilter === 'alternative') return item.match_type === 'alternative';
    if (matchFilter === 'related') return item.match_type === 'related';
    return true;
  });

  const handleResetFilters = () => {
    setQuery('');
    setDebouncedQuery('');
    setSelectedCategory('all');
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setSortOrder('relevance');
    setMatchFilter('all');
    setPage(1);
  };

  const handleCreateDemandRedirect = () => {
    const params = new URLSearchParams();
    if (query.trim()) params.append('product', query.trim());
    if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);
    if (maxPrice) params.append('price', String(maxPrice));
    params.append('description', `Buyer requirement for: ${query.trim() || 'Custom Specification'}`);
    navigate(`/customer/demands/create?${params.toString()}`);
  };

  // Table columns for table view
  const columns: ColumnsType<ProductMatchItem> = [
    {
      title: 'Product Title',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ProductMatchItem) => {
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
      title: 'Match Type',
      key: 'match_type',
      render: (_: any, r: ProductMatchItem) => (
        <Space orientation="vertical" size={2}>
          {r.match_type === 'exact' && (
            <Tag color="success" icon={<CheckCircleOutlined />} style={{ borderRadius: 12, fontWeight: 700 }}>
              Exact Match
            </Tag>
          )}
          {r.match_type === 'similar' && (
            <Tag color="blue" icon={<ThunderboltOutlined />} style={{ borderRadius: 12, fontWeight: 600 }}>
              Similar Match
            </Tag>
          )}
          {r.match_type === 'alternative' && (
            <Tag color="orange" icon={<SwapOutlined />} style={{ borderRadius: 12, fontWeight: 700 }}>
              Alternative
            </Tag>
          )}
          {r.match_type === 'related' && (
            <Tag color="purple" icon={<AppstoreOutlined />} style={{ borderRadius: 12, fontWeight: 600 }}>
              Related
            </Tag>
          )}
          {r.match_reasons?.[0] && (
            <span style={{ fontSize: 11, color: '#64748B' }}>{r.match_reasons[0]}</span>
          )}
        </Space>
      ),
    },
    {
      title: 'Sector',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => (
        <Tag color="blue" style={{ borderRadius: 12, fontWeight: 500 }}>
          {cat}
        </Tag>
      ),
    },
    {
      title: 'Retail Price',
      key: 'retail_price',
      render: (_: any, r: ProductMatchItem) => {
        const val = r.retail_price ?? r.market_price ?? 0;
        return <span style={{ fontWeight: 600, color: '#172B4D', fontSize: 14 }}>${val.toFixed(2)}</span>;
      },
    },
    {
      title: 'Group Target Price',
      key: 'wholesale_price',
      render: (_: any, r: ProductMatchItem) => {
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
      key: 'stock',
      render: (_: any, r: ProductMatchItem) => (
        <div>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
            MOQ: {r.minimum_order_quantity ?? 1} {r.unit ?? 'units'}
          </span>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            Stock: {r.available_quantity ?? 0} {r.unit ?? 'units'}
          </div>
        </div>
      ),
    },
    {
      title: 'Action',
      key: 'actions',
      align: 'right',
      render: (_: any, record: ProductMatchItem) => {
        const inStock = record.status === 'active' && (record.available_quantity ?? 0) > 0;
        return (
          <Space size={8}>
            <Button
              size="middle"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/customer/products/${record.id}`)}
              style={{ borderRadius: 6, fontWeight: 500 }}
            >
              Details
            </Button>
            {inStock ? (
              <Button
                size="middle"
                type="primary"
                icon={<ShoppingCartOutlined />}
                onClick={() => handleOpenOrderModal(record)}
                style={{ borderRadius: 6, background: '#1677FF', fontWeight: 600 }}
              >
                Purchase
              </Button>
            ) : (
              <Button
                size="middle"
                type="default"
                icon={<AppstoreAddOutlined />}
                onClick={() => navigate(`/customer/demands/create?product=${encodeURIComponent(record.name)}`)}
                style={{ borderRadius: 6, fontWeight: 600 }}
              >
                Pool Demand
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Header Hero Card */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} styles={{ body: { padding: '24px 28px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
              Smart Product Search & Specification Matching
            </Title>
            <Paragraph type="secondary" style={{ margin: '6px 0 0 0', fontSize: 13.5, color: '#6B778C' }}>
              Search across model numbers, certified brands, and engineering parameters. When identical catalogue models are unavailable, inspect related alternatives or initiate a targeted buyer demand pool.
            </Paragraph>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              size="large"
              icon={<AppstoreAddOutlined />}
              onClick={handleCreateDemandRedirect}
              style={{ background: '#1677FF', borderRadius: 8, fontWeight: 600 }}
            >
              Can't Find? Create Demand
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 2. Interactive Search & Debounced Input Bar */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} styles={{ body: { padding: '20px 24px' } }}>
        <Row gutter={[16, 16]} align="middle">
          {/* Main Search Input */}
          <Col xs={24}>
            <Input
              placeholder="Search by product name, manufacturer, model number (e.g. AE-GW-9000X), or technical specs (e.g. IP67, LiFePO4)..."
              allowClear
              size="large"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              prefix={<SearchOutlined style={{ color: '#8993A4', fontSize: 18, marginRight: 6 }} />}
              suffix={loading ? <Spin size="small" /> : null}
              style={{ borderRadius: 8, fontSize: 14.5 }}
            />
          </Col>

          {/* Quick Search Chips */}
          <Col xs={24}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 600 }}>Suggested Queries:</span>
              {sampleSuggestions.map((sug) => (
                <Tag
                  key={sug}
                  onClick={() => setQuery(sug)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 12,
                    padding: '2px 10px',
                    backgroundColor: query === sug ? '#EFF6FF' : '#F1F5F9',
                    color: query === sug ? '#2563EB' : '#475569',
                    borderColor: query === sug ? '#93C5FD' : '#E2E8F0',
                    fontWeight: query === sug ? 600 : 500,
                  }}
                >
                  {sug}
                </Tag>
              ))}
            </div>
          </Col>
        </Row>

        <Divider style={{ margin: '16px 0' }} />

        {/* Filters and Sort Row */}
        <Row gutter={[16, 16]} align="middle">
          {/* Category Filter */}
          <Col xs={24} sm={12} md={6}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Filter by Sector:</div>
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

          {/* Price Range Filter */}
          <Col xs={24} sm={12} md={6}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Price Range ($):</div>
            <Space size={6} style={{ width: '100%' }}>
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
          <Col xs={16} sm={12} md={6}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4 }}>Sort Order:</div>
            <Select
              style={{ width: '100%' }}
              value={sortOrder}
              onChange={(val) => {
                setSortOrder(val);
                setPage(1);
              }}
              options={[
                { label: 'Highest Relevance', value: 'relevance' },
                { label: 'Price: Low to High', value: 'price_asc' },
                { label: 'Price: High to Low', value: 'price_desc' },
                { label: 'Newest Products', value: 'newest' },
              ]}
              suffixIcon={<SortAscendingOutlined style={{ color: '#8993A4' }} />}
            />
          </Col>

          {/* View Mode & Reset */}
          <Col xs={8} sm={12} md={6} style={{ textAlign: 'right', marginTop: 'auto' }}>
            <Space size={10}>
              <Radio.Group
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                buttonStyle="solid"
                size="middle"
              >
                <Radio.Button value="cards">
                  <AppstoreOutlined />
                </Radio.Button>
                <Radio.Button value="table">
                  <BarsOutlined />
                </Radio.Button>
              </Radio.Group>
              <Button type="text" icon={<ClearOutlined />} onClick={handleResetFilters} style={{ color: '#64748B' }}>
                Reset
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 3. Match Distinction Filters (All vs Exact vs Similar vs Alternative vs Related) */}
      {searchResult && searchResult.total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Radio.Group
            value={matchFilter}
            onChange={(e) => setMatchFilter(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="all">
              All Results ({searchResult.total})
            </Radio.Button>
            <Radio.Button value="exact">
              <CheckCircleOutlined style={{ marginRight: 4, color: '#059669' }} />
              Exact ({searchResult.exact_count})
            </Radio.Button>
            <Radio.Button value="similar">
              <ThunderboltOutlined style={{ marginRight: 4, color: '#1677FF' }} />
              Similar ({searchResult.similar_count})
            </Radio.Button>
            <Radio.Button value="alternative">
              <SwapOutlined style={{ marginRight: 4, color: '#FA8C16' }} />
              Alternatives ({searchResult.alternative_count || 0})
            </Radio.Button>
            <Radio.Button value="related">
              <AppstoreOutlined style={{ marginRight: 4, color: '#722ED1' }} />
              Related ({searchResult.related_count || 0})
            </Radio.Button>
          </Radio.Group>

          <Text type="secondary" style={{ fontSize: 13, color: '#64748B' }}>
            Showing <strong>{displayedItems.length}</strong> matching catalogue products
          </Text>
        </div>
      )}

      {/* 4. Similar Products Guidance Banner when No Exact Match Exists */}
      {searchResult && !searchResult.has_exact_match && searchResult.total > 0 && (
        <Alert
          message={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <span style={{ fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ThunderboltOutlined style={{ color: '#7C3AED', fontSize: 16 }} />
                  We couldn't find an exact match for "{query}"
                </span>
                <span style={{ fontSize: 13, color: '#475569', display: 'block', marginTop: 2 }}>
                  Here are related commercial products sharing comparable components or sector classifications. You can explore them or initiate a targeted demand for your exact specifications.
                </span>
              </div>
              <Button
                type="primary"
                onClick={handleCreateDemandRedirect}
                style={{ background: '#1677FF', borderRadius: 6, fontWeight: 600 }}
              >
                Create Custom Demand Instead &rarr;
              </Button>
            </div>
          }
          type="warning"
          style={{ background: '#FFFBEB', borderColor: '#FDE68A', borderRadius: 8 }}
        />
      )}

      {errorMsg && (
        <Alert
          message="Search Error"
          description={errorMsg}
          type="error"
          showIcon
          closable
          onClose={() => setErrorMsg(null)}
        />
      )}

      {/* 5. Results Area */}
      {!hasActiveQuery ? (
        <Card
          style={{
            background: '#FFFFFF',
            borderColor: '#E2E8F0',
            borderRadius: 12,
            padding: '52px 24px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
          styles={{ body: { padding: 0 } }}
        >
          <div style={{ maxWidth: 660, margin: '0 auto' }}>
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                background: '#F0F7FF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                border: '1px solid #BAE0FF',
              }}
            >
              <SearchOutlined style={{ fontSize: 30, color: '#1677FF' }} />
            </div>

            <Title level={4} style={{ color: '#172B4D', margin: 0, fontWeight: 700 }}>
              Search by Specifications or Model Requirements
            </Title>
            <Paragraph type="secondary" style={{ fontSize: 14, color: '#64748B', marginTop: 10, lineHeight: 1.6 }}>
              Products will be matched and ranked by relevance against your specifications. Enter a model number, part description, or engineering requirement in the search box above.
            </Paragraph>

            <Alert
              message={
                <div style={{ fontSize: 13, color: '#334155', textAlign: 'left' }}>
                  <strong>E-Commerce Store Link:</strong> External e-commerce product feeds are not linked yet. Once connected, items matching your specifications will stream and rank here automatically.
                </div>
              }
              type="info"
              showIcon
              style={{
                background: '#F8FAFC',
                borderColor: '#E2E8F0',
                borderRadius: 8,
                textAlign: 'left',
                margin: '22px auto 26px auto',
                maxWidth: 580,
              }}
            />

            <div style={{ margin: '16px 0 24px 0' }}>
              <Text strong style={{ fontSize: 13, color: '#475569', display: 'block', marginBottom: 12 }}>
                Try searching one of these sample specifications:
              </Text>
              <Space wrap size={[8, 10]} style={{ justifyContent: 'center' }}>
                {sampleSuggestions.map((item) => (
                  <Button
                    key={item}
                    size="middle"
                    onClick={() => {
                      setQuery(item);
                      setDebouncedQuery(item);
                    }}
                    style={{
                      borderRadius: 20,
                      fontSize: 13,
                      background: '#F1F5F9',
                      borderColor: '#CBD5E1',
                      color: '#1E293B',
                      fontWeight: 500,
                    }}
                  >
                    🔍 {item}
                  </Button>
                ))}
              </Space>
            </div>

            <Divider style={{ margin: '24px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Need a custom unlisted part or specialized build?
              </Text>
              <Button
                type="primary"
                icon={<AppstoreAddOutlined />}
                onClick={handleCreateDemandRedirect}
                style={{ borderRadius: 8, fontWeight: 600, background: '#1677FF' }}
              >
                Create Product Demand Pool
              </Button>
            </div>
          </div>
        </Card>
      ) : loading ? (
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
      ) : displayedItems.length > 0 ? (
        viewMode === 'cards' ? (
          <>
            <Row gutter={[20, 20]}>
              {displayedItems.map((product) => {
                const img =
                  product.images?.[0] ||
                  product.image_url ||
                  'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80';
                const retail = product.retail_price ?? product.market_price ?? 0;
                const wholesale = product.wholesale_price ?? product.min_demand_price ?? Math.round(retail * 0.75);
                const isExact = product.match_type === 'exact';
                const matchPct = Math.round((product.relevance_score || 0.8) * 100);
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
                        borderColor: isExact ? '#CBD5E1' : '#E2E8F0',
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
                            src={img}
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.onerror = null;
                              target.src = getCategoryFallbackImage(product.category);
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 10 }}
                          />
                          {/* Match Classification Badge */}
                          <div style={{ position: 'absolute', top: 10, right: 8 }}>
                            {product.match_type === 'exact' && (
                              <Tag color="success" style={{ margin: 0, fontWeight: 700, borderRadius: 12 }}>
                                <CheckCircleOutlined /> Exact Match
                              </Tag>
                            )}
                            {product.match_type === 'similar' && (
                              <Tag color="blue" style={{ margin: 0, fontWeight: 600, borderRadius: 12 }}>
                                <ThunderboltOutlined /> Similar Match
                              </Tag>
                            )}
                            {product.match_type === 'alternative' && (
                              <Tag color="orange" style={{ margin: 0, fontWeight: 700, borderRadius: 12 }}>
                                <SwapOutlined /> Alternative
                              </Tag>
                            )}
                            {product.match_type === 'related' && (
                              <Tag color="purple" style={{ margin: 0, fontWeight: 600, borderRadius: 12 }}>
                                <AppstoreOutlined /> Related
                              </Tag>
                            )}
                          </div>
                          {/* Relevance Score Pill */}
                          <div style={{ position: 'absolute', top: 10, left: 8 }}>
                            <Tag color="blue" style={{ margin: 0, fontWeight: 700, borderRadius: 12 }}>
                              {matchPct}% Match
                            </Tag>
                          </div>
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
                      {/* Sector & Brand */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>
                          {product.category}
                        </span>
                        {product.brand && (
                          <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>
                            {product.brand}
                          </span>
                        )}
                      </div>

                      {/* Product Title */}
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

                      {/* Model & SKU */}
                      <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 8 }}>
                        Model: <span style={{ fontWeight: 600, color: '#334155' }}>{product.model_number || product.sku}</span>
                      </div>

                      {/* Match Reasons Pill Explanations */}
                      {product.match_reasons && product.match_reasons.length > 0 && (
                        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {product.match_reasons.slice(0, 2).map((reason, idx) => (
                            <Tag
                              key={idx}
                              style={{
                                fontSize: 11,
                                padding: '1px 6px',
                                margin: 0,
                                borderRadius: 6,
                                background: isExact ? '#ECFDF5' : '#F5F3FF',
                                color: isExact ? '#065F46' : '#5B21B6',
                                borderColor: isExact ? '#A7F3D0' : '#DDD6FE',
                              }}
                            >
                              {reason}
                            </Tag>
                          ))}
                        </div>
                      )}

                      {/* Pricing Matrix */}
                      <div
                        style={{
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          padding: '10px 12px',
                          borderRadius: 8,
                          marginBottom: 16,
                          marginTop: 'auto',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 11.5, color: '#64748B' }}>Retail Catalog:</span>
                          <span style={{ fontSize: 14.5, fontWeight: 700, color: '#172B4D' }}>
                            ${retail.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                          <span style={{ fontSize: 11.5, color: '#2563EB', fontWeight: 600 }}>
                            Group Demand Target:
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>
                            from ${wholesale.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                          type="default"
                          style={{
                            flex: 1,
                            borderRadius: 6,
                            fontWeight: 500,
                            height: 36,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          icon={<EyeOutlined />}
                          onClick={() => navigate(`/customer/products/${product.id}`)}
                        >
                          Details
                        </Button>
                        {inStock ? (
                          <Button
                            type="primary"
                            style={{
                              flex: 1.25,
                              borderRadius: 6,
                              fontWeight: 600,
                              background: '#1677FF',
                              borderColor: '#1677FF',
                              height: 36,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            icon={<ShoppingCartOutlined />}
                            onClick={() => handleOpenOrderModal(product)}
                          >
                            Purchase
                          </Button>
                        ) : (
                          <Button
                            type="default"
                            style={{
                              flex: 1.25,
                              borderRadius: 6,
                              fontWeight: 600,
                              borderColor: '#1677FF',
                              color: '#1677FF',
                              height: 36,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            icon={<AppstoreAddOutlined />}
                            onClick={() => navigate(`/customer/demands/create?product=${encodeURIComponent(product.name)}`)}
                          >
                            Pool Demand
                          </Button>
                        )}
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Pagination
                current={page}
                pageSize={pageSize}
                total={searchResult?.total || 0}
                showTotal={(total, range) => `Showing ${range[0]}-${range[1]} of ${total} matched products`}
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
          <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} styles={{ body: { padding: 0 } }}>
            <Table<ProductMatchItem>
              columns={columns}
              dataSource={displayedItems}
              rowKey="id"
              pagination={{
                current: page,
                pageSize: pageSize,
                total: searchResult?.total || 0,
                onChange: (p, ps) => {
                  setPage(p);
                  setPageSize(ps);
                },
              }}
            />
          </Card>
        )
      ) : (
        /* 6. Product Not Found Flow (Section 4) */
        <Card style={{ background: '#FFFFFF', textAlign: 'center', padding: '50px 20px', borderColor: '#E2E8F0', borderRadius: 10 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div style={{ maxWidth: 560, margin: '0 auto' }}>
                <Title level={4} style={{ margin: '14px 0 8px 0', color: '#172B4D', fontWeight: 700 }}>
                  We couldn't find an exact match for your product
                </Title>
                <Paragraph style={{ color: '#64748B', fontSize: 14 }}>
                  No verified commercial catalogue items currently match "{query}". Instead of settling for an unsuitable substitute, you can create a targeted Product Demand to pool buyer volume and attract competitive merchant offers.
                </Paragraph>
                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 12 }}>
                  <Button
                    type="primary"
                    size="large"
                    icon={<AppstoreAddOutlined />}
                    onClick={handleCreateDemandRedirect}
                    style={{ background: '#1677FF', borderRadius: 8, fontWeight: 600, height: 44, padding: '0 24px' }}
                  >
                    Create Product Demand
                  </Button>
                  <Button size="large" onClick={handleResetFilters} style={{ borderRadius: 8, height: 44 }}>
                    Clear Search & Filters
                  </Button>
                </div>
              </div>
            }
          />
        </Card>
      )}
      {/* Purchase Confirmation Modal */}
      <Modal
        title={
          <Space>
            <ShoppingCartOutlined style={{ color: '#1677FF' }} />
            <span style={{ fontWeight: 700 }}>Confirm Commercial Order Request</span>
          </Space>
        }
        open={orderModalVisible}
        onCancel={() => setOrderModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setOrderModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={orderSubmitting}
            onClick={handleConfirmOrder}
            style={{ background: '#1677FF', fontWeight: 600 }}
          >
            Confirm & Place Order
          </Button>,
        ]}
      >
        {orderProduct && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <img
                src={
                  orderProduct.images?.[0] ||
                  orderProduct.image_url ||
                  getCategoryFallbackImage(orderProduct.category)
                }
                alt={orderProduct.name}
                onError={(e) => {
                  const target = e.currentTarget;
                  target.onerror = null;
                  target.src = getCategoryFallbackImage(orderProduct.category);
                }}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 6,
                  objectFit: 'contain',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: '#172B4D' }}>
                  {orderProduct.name}
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  SKU: {orderProduct.model_number || orderProduct.sku} &bull; {orderProduct.category}
                </div>
              </div>
            </div>

            <Divider style={{ margin: '8px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 12, color: '#64748B' }}>Quantity ({orderProduct.unit || 'unit'}):</span>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  Minimum order: {orderProduct.minimum_order_quantity || 1} &bull; In stock:{' '}
                  {orderProduct.available_quantity || 100}
                </div>
              </div>
              <InputNumber
                min={orderProduct.minimum_order_quantity || 1}
                max={orderProduct.available_quantity || 1000}
                value={orderQty}
                onChange={(val) => setOrderQty(val || 1)}
                style={{ width: 100 }}
              />
            </div>

            <div
              style={{
                background: '#F8FAFC',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>Unit Price:</span>
                <span style={{ fontWeight: 600 }}>
                  $
                  {(orderQty >= 10
                    ? orderProduct.wholesale_price || orderProduct.retail_price
                    : orderProduct.retail_price
                  ).toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>Estimated Freight / Logistics:</span>
                <span style={{ color: '#059669', fontWeight: 600 }}>Included (Escrow Protected)</span>
              </div>
              <Divider style={{ margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                <strong style={{ color: '#172B4D' }}>Total Amount:</strong>
                <strong style={{ color: '#1677FF' }}>
                  $
                  {(
                    (orderQty >= 10
                      ? orderProduct.wholesale_price || orderProduct.retail_price
                      : orderProduct.retail_price) * orderQty
                  ).toFixed(2)}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#059669' }}>
              <SafetyCertificateOutlined />
              <span>Full MarketTwin escrow protection and pre-dispatch inspection guarantee apply.</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProductSearch;
