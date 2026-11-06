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
  Badge,
  Rate,
  Typography,
  Space,
  Divider,
  Statistic,
  Table,
  Progress,
  Modal,
  InputNumber,
  message,
  Tooltip,
  Empty,
  Spin,
  Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined,
  ShoppingOutlined,
  AppstoreOutlined,
  FireOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  DollarOutlined,
  ArrowRightOutlined,
  SwapOutlined,
  EyeOutlined,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  ClearOutlined,
  AppstoreAddOutlined,
  TagsOutlined,
  DiffOutlined,
  ToolOutlined,
  DeploymentUnitOutlined,
  ApartmentOutlined,
  ExperimentOutlined,
  ApiOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { productApi, Product, ProductMatchItem, ProductSearchResponse } from '../../api/productApi';
import demandApi from '../../api/demandApi';
import { fetchDemandGroups } from '../../services/demandService';
import { fetchOffers } from '../../services/offerService';
import { fetchOrders, createOrder } from '../../services/orderService';

const { Title, Text, Paragraph } = Typography;

export const CustomerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductSearchResponse | null>(null);

  // Product Discovery Data
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [alternativesShowcase, setAlternativesShowcase] = useState<{
    similar: ProductMatchItem[];
    alternatives: ProductMatchItem[];
  }>({ similar: [], alternatives: [] });
  const [recentlyAddedProducts, setRecentlyAddedProducts] = useState<Product[]>([]);

  // Customer Activity Data
  const [demands, setDemands] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);

  // Page Loading State
  const [loading, setLoading] = useState(true);

  // Quick Purchase / Order Modal State
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [orderProduct, setOrderProduct] = useState<Product | null>(null);
  const [orderQty, setOrderQty] = useState<number>(1);
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  // Category Icon Map
  const getCategoryIcon = (cat: string) => {
    const c = cat.toLowerCase();
    if (c.includes('hardware') || c.includes('industrial')) return <ToolOutlined style={{ fontSize: 22, color: '#1677FF' }} />;
    if (c.includes('energy') || c.includes('power')) return <ThunderboltOutlined style={{ fontSize: 22, color: '#FAAD14' }} />;
    if (c.includes('network') || c.includes('telecom')) return <DeploymentUnitOutlined style={{ fontSize: 22, color: '#52C41A' }} />;
    if (c.includes('automation') || c.includes('robotics')) return <ApartmentOutlined style={{ fontSize: 22, color: '#722ED1' }} />;
    if (c.includes('medical') || c.includes('lab')) return <ExperimentOutlined style={{ fontSize: 22, color: '#EB2F96' }} />;
    if (c.includes('instrument')) return <ApiOutlined style={{ fontSize: 22, color: '#13C2C2' }} />;
    return <ShoppingOutlined style={{ fontSize: 22, color: '#1677FF' }} />;
  };

  // 1. Initial Data Fetching from Supabase & Backend Services
  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const userId = user?.id;

        // Load Catalogue & Discovery Endpoints
        const [recs, cats, popular, recent, allCatalogRes] = await Promise.all([
          productApi.getRecommendations(userId, 8).catch(() => []),
          productApi.getCategories().catch(() => [
            'Industrial Hardware',
            'Instrumentation',
            'Energy & Power',
            'Automation & Robotics',
            'Networking & Telecom',
            'Medical & Lab Equipment',
          ]),
          productApi.getPopularProducts(8).catch(() => []),
          productApi.getRecentlyAddedProducts(8).catch(() => []),
          productApi.getProducts({ page: 1, page_size: 20 }).catch(() => ({ items: [] })),
        ]);

        setRecommendedProducts(recs.length > 0 ? recs : allCatalogRes.items.slice(0, 8));
        setCategories(cats);
        setPopularProducts(popular.length > 0 ? popular : allCatalogRes.items.slice(0, 8));
        setRecentlyAddedProducts(recent.length > 0 ? recent : allCatalogRes.items.slice(0, 8));

        // Load intelligent alternatives showcase
        if (allCatalogRes.items.length > 0) {
          const sampleProd = allCatalogRes.items[0];
          try {
            const simData = await productApi.getSimilarAndAlternatives(sampleProd.id, 4);
            setAlternativesShowcase({
              similar: simData.similar || [],
              alternatives: simData.alternatives || [],
            });
          } catch {
            // fallback
          }
        }

        // Load Customer Specific Activity Records
        if (userId) {
          const [demandsRes, g, o, ord] = await Promise.all([
            demandApi.listDemands().catch(() => ({ items: [] })),
            fetchDemandGroups().catch(() => []),
            fetchOffers().catch(() => []),
            fetchOrders({ customerId: userId }).catch(() => []),
          ]);
          setDemands(demandsRes.items || []);
          setGroups(g || []);
          setOffers(o || []);
          setOrders(ord || []);

          // Load recently viewed products from isolated user localStorage
          try {
            const storageKey = `markettwin_recent_views_${userId}`;
            const storedViews = JSON.parse(localStorage.getItem(storageKey) || '[]');
            setRecentlyViewed(Array.isArray(storedViews) ? storedViews.slice(0, 6) : []);
          } catch {
            setRecentlyViewed([]);
          }
        }
      } catch (err) {
        console.error('Error initializing customer dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [user]);

  // 2. Perform Real-Time Catalogue Search on Dashboard
  const handleExecuteSearch = useCallback(
    async (overrideQuery?: string, overrideCat?: string) => {
      const q = overrideQuery !== undefined ? overrideQuery : searchQuery;
      const cat = overrideCat !== undefined ? overrideCat : selectedCategory;

      if (!q.trim() && (!cat || cat === 'all')) {
        setSearchResults(null);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const res = await productApi.searchProducts({
          q: q.trim() || undefined,
          category: cat === 'all' ? undefined : cat,
          page: 1,
          page_size: 20,
        });
        setSearchResults(res);
      } catch (err) {
        console.error('Dashboard search error:', err);
        message.error('Product search query could not be processed.');
      }
    },
    [searchQuery, selectedCategory]
  );

  const handleClearSearch = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSearchResults(null);
    setIsSearching(false);
  };

  // 3. Purchase / Order Confirmation Flow
  const handleOpenOrderModal = (product: Product) => {
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
        customer_id: user.id,
        product_title: orderProduct.name,
        quantity: orderQty,
        unit_price: unitPrice,
        total_amount: totalAmount,
        currency: 'USD',
        status: 'Confirmed',
        shipping_address: user.email || 'Customer Standard Freight Address',
        created_at: new Date().toISOString(),
      });

      message.success(`Order placed successfully for ${orderQty} ${orderProduct.unit || 'unit'}(s)!`);
      setOrderModalVisible(false);

      // Refresh customer orders
      const ord = await fetchOrders({ customerId: user.id }).catch(() => []);
      setOrders(ord);
    } catch (err: any) {
      console.error('Order placement failed:', err);
      message.error(err.message || 'Failed to place order.');
    } finally {
      setOrderSubmitting(false);
    }
  };

  // 4. Secondary Custom Demand Fallback Redirect
  const handleRedirectToCustomDemand = (defaultTitle?: string, defaultCat?: string) => {
    const params = new URLSearchParams();
    const titleVal = defaultTitle || searchQuery.trim();
    if (titleVal) params.append('product', titleVal);
    if (defaultCat && defaultCat !== 'all') {
      params.append('category', defaultCat);
    } else if (selectedCategory && selectedCategory !== 'all') {
      params.append('category', selectedCategory);
    }
    params.append(
      'description',
      `Custom specification requested for ${titleVal || 'industrial equipment'}. Mandatory engineering specs, tolerances, and quality criteria to be fulfilled.`
    );
    navigate(`/customer/demands/create?${params.toString()}`);
  };

  // Active Demands & Groups Table Columns
  const activeDemands = demands.filter((d) => d.status !== 'Completed');
  const demandColumns: ColumnsType<any> = [
    {
      title: 'Demand Code',
      dataIndex: 'demand_code',
      key: 'demand_code',
      render: (text) => <Text strong style={{ color: '#1677FF' }}>{text || 'DMD-AUTO'}</Text>,
    },
    {
      title: 'Product Title',
      dataIndex: 'product_name',
      key: 'title',
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 600, color: '#172B4D' }}>{text}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.category}</Text>
        </div>
      ),
    },
    {
      title: 'Target Price / Unit',
      dataIndex: 'target_unit_price',
      key: 'target_price',
      render: (val, record) => (
        <div>
          <span style={{ fontWeight: 600, color: '#172B4D' }}>${val}</span>
          {record.market_price && (
            <span style={{ fontSize: 11, color: '#6B778C', textDecoration: 'line-through', marginLeft: 6 }}>
              ${record.market_price}
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Group Progress',
      key: 'groupProgress',
      render: (_, record) => {
        const percent = record.group_threshold
          ? Math.min(Math.round((record.current_group_quantity / record.group_threshold) * 100), 100)
          : 0;
        return (
          <div style={{ width: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span>{record.current_group_quantity || 0} / {record.group_threshold || 10} units</span>
              <span style={{ fontWeight: 600 }}>{percent}%</span>
            </div>
            <Progress percent={percent} size="small" strokeColor="#1677FF" showInfo={false} />
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (st: string) => {
        let color = 'default';
        if (st === 'Grouped') color = 'blue';
        if (st === 'Offers Received') color = 'gold';
        if (st === 'Approved') color = 'green';
        return <Tag color={color}>{st || 'Active'}</Tag>;
      },
    },
    {
      title: 'Offers',
      dataIndex: 'offers_count',
      key: 'offers_count',
      render: (count: number) => <span>{count ?? 0}</span>,
    },
    {
      title: 'Action',
      key: 'action',
      render: () => (
        <Button type="link" size="small" onClick={() => navigate('/customer/offers')}>
          View Offers
        </Button>
      ),
    },
  ];

  // Helper Card Component for Product Grid
  const renderProductCard = (
    product: Product,
    tierBadge?: { label: string; color: string; explanation?: string }
  ) => {
    const retail = product.retail_price ?? product.market_price ?? 0;
    const wholesale = product.wholesale_price ?? product.min_demand_price ?? Math.round(retail * 0.75);
    const inStock = product.status === 'active' && (product.available_quantity ?? 0) > 0;
    const imgUrl =
      product.images?.[0] ||
      product.image_url ||
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80';

    return (
      <Col xs={24} sm={12} md={8} lg={6} key={product.id}>
        <Card
          hoverable
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 10,
            borderColor: '#E2E8F0',
            overflow: 'hidden',
          }}
          styles={{
            body: {
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
            },
          }}
          cover={
            <div
              style={{
                height: 180,
                position: 'relative',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: '1px solid #F1F5F9',
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/customer/products/${product.id}`)}
            >
              <img
                alt={product.name}
                src={imgUrl}
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }}
              />
              {tierBadge && (
                <div style={{ position: 'absolute', top: 10, left: 10 }}>
                  <Tag
                    color={tierBadge.color}
                    style={{
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: 11,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                    }}
                  >
                    {tierBadge.label}
                  </Tag>
                </div>
              )}
              <div style={{ position: 'absolute', top: 10, right: 10 }}>
                <Tag
                  color={inStock ? 'success' : 'warning'}
                  style={{ borderRadius: 10, fontWeight: 600, fontSize: 11 }}
                >
                  {inStock ? 'In Stock' : 'Demand Pool'}
                </Tag>
              </div>
            </div>
          }
        >
          {/* Category & Brand */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text type="secondary" style={{ fontSize: 11.5, fontWeight: 500 }}>
              {product.category}
            </Text>
            {product.brand && (
              <Text strong style={{ fontSize: 11, color: '#1677FF' }}>
                {product.brand}
              </Text>
            )}
          </div>

          {/* Title */}
          <Tooltip title={product.name}>
            <Title
              level={5}
              style={{
                margin: '0 0 8px 0',
                fontSize: 14.5,
                fontWeight: 600,
                color: '#172B4D',
                lineHeight: '20px',
                height: 40,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/customer/products/${product.id}`)}
            >
              {product.name}
            </Title>
          </Tooltip>

          {/* Rating */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Rate disabled defaultValue={product.rating ?? 4.9} style={{ fontSize: 11.5, color: '#FAAD14' }} />
            <span style={{ fontSize: 11.5, color: '#64748B' }}>
              ({product.reviews_count ?? 12})
            </span>
          </div>

          {/* Explanation if Alternative or Similar */}
          {tierBadge?.explanation && (
            <div
              style={{
                background: '#F8FAFC',
                padding: '6px 8px',
                borderRadius: 6,
                fontSize: 11,
                color: '#475569',
                marginBottom: 10,
                borderLeft: `3px solid ${tierBadge.color === 'orange' ? '#FA8C16' : '#1677FF'}`,
              }}
            >
              {tierBadge.explanation}
            </div>
          )}

          {/* Pricing Box */}
          <div
            style={{
              background: '#F8FAFC',
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #EDF2F7',
              marginBottom: 14,
              marginTop: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <span style={{ fontSize: 11, color: '#64748B', display: 'block' }}>Retail Price</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#172B4D' }}>
                  ${retail.toFixed(2)}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, color: '#059669', fontWeight: 600, display: 'block' }}>
                  Bulk Pool Target
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>
                  ${wholesale.toFixed(2)}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>MOQ: {product.minimum_order_quantity ?? 1} {product.unit || 'unit'}</span>
              <span>Available: {product.available_quantity ?? 0}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <Space size={8} style={{ width: '100%' }}>
            <Button
              size="middle"
              style={{ flex: 1, borderRadius: 6, fontWeight: 500 }}
              onClick={() => navigate(`/customer/products/${product.id}`)}
            >
              Details
            </Button>
            {inStock ? (
              <Button
                type="primary"
                size="middle"
                icon={<ShoppingCartOutlined />}
                style={{ flex: 1.2, borderRadius: 6, background: '#1677FF', fontWeight: 600 }}
                onClick={() => handleOpenOrderModal(product)}
              >
                Purchase
              </Button>
            ) : (
              <Button
                type="default"
                size="middle"
                icon={<AppstoreAddOutlined />}
                style={{ flex: 1.2, borderRadius: 6, fontWeight: 600 }}
                onClick={() => handleRedirectToCustomDemand(product.name, product.category)}
              >
                Pool Demand
              </Button>
            )}
          </Space>
        </Card>
      </Col>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* =========================================================================
          SECTION 1: WELCOME & PROMINENT PRODUCT SEARCH
          ========================================================================= */}
      <Card
        style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F7FF 100%)',
          borderColor: '#BAE0FF',
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(22, 119, 255, 0.08)',
        }}
        styles={{ body: { padding: '28px 32px' } }}
      >
        <Row gutter={[20, 20]} align="middle">
          <Col xs={24} lg={16}>
            <Space orientation="vertical" size={6}>
              <Tag
                color="blue"
                icon={<ThunderboltOutlined />}
                style={{ fontWeight: 600, padding: '2px 10px', borderRadius: 12 }}
              >
                COMMERCIAL CATALOGUE &bull; PRODUCT DISCOVERY PORTAL
              </Tag>
              <Title level={2} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                Find verified commercial products and alternatives
              </Title>
              <Paragraph style={{ margin: 0, fontSize: 14.5, color: '#475569', lineHeight: 1.5 }}>
                Search over verified industrial equipment, materials, and components. If an exact item is unavailable,
                our intelligent engine matches functionally compatible alternatives before custom demand pooling.
              </Paragraph>
            </Space>
          </Col>
          <Col xs={24} lg={8} style={{ textAlign: 'right' }}>
            <Space size={10} wrap>
              <Button
                size="large"
                icon={<ShoppingOutlined />}
                onClick={() => navigate('/customer/catalogue')}
                style={{ borderRadius: 8, fontWeight: 500 }}
              >
                Explore Full Catalog
              </Button>
              <Button
                type="default"
                size="large"
                icon={<AppstoreAddOutlined />}
                onClick={() => handleRedirectToCustomDemand()}
                style={{ borderRadius: 8, fontWeight: 600 }}
              >
                Create Custom Demand
              </Button>
            </Space>
          </Col>
        </Row>

        <Divider style={{ margin: '22px 0 20px 0' }} />

        {/* Prominent Search Bar */}
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={14} lg={16}>
            <Input
              size="large"
              placeholder="Search by product name, brand, model (e.g. WT-SS304-1000L), material (SS 304, HDPE), or technical specs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPressEnter={() => handleExecuteSearch()}
              allowClear
              prefix={<SearchOutlined style={{ color: '#8993A4', fontSize: 18, marginRight: 6 }} />}
              style={{ borderRadius: 8, fontSize: 14.5, height: 48 }}
            />
          </Col>
          <Col xs={24} sm={16} md={6} lg={5}>
            <Select
              size="large"
              style={{ width: '100%', height: 48 }}
              value={selectedCategory}
              onChange={(val) => {
                setSelectedCategory(val);
                handleExecuteSearch(searchQuery, val);
              }}
              options={[
                { label: 'All Sectors & Categories', value: 'all' },
                ...categories.map((c) => ({ label: c, value: c })),
              ]}
            />
          </Col>
          <Col xs={24} sm={8} md={4} lg={3}>
            <Button
              type="primary"
              size="large"
              icon={<SearchOutlined />}
              onClick={() => handleExecuteSearch()}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 8,
                background: '#1677FF',
                fontWeight: 600,
              }}
            >
              Search
            </Button>
          </Col>
        </Row>

        {/* Quick Suggestion Chips */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 600 }}>Frequent searches:</span>
          {[
            'SS 304 Water Storage Tank – 1000 Litres',
            'SS 316 Water Storage Tank',
            'IoT Gateway',
            'LiFePO4 Energy Module 48V',
            'NEMA 34 Stepper',
            'Ultrasonic Flow Meter',
          ].map((tagText) => (
            <Tag
              key={tagText}
              style={{
                cursor: 'pointer',
                borderRadius: 12,
                padding: '3px 10px',
                background: searchQuery === tagText ? '#EFF6FF' : '#FFFFFF',
                borderColor: searchQuery === tagText ? '#1677FF' : '#E2E8F0',
                color: searchQuery === tagText ? '#1677FF' : '#475569',
                fontWeight: searchQuery === tagText ? 600 : 500,
              }}
              onClick={() => {
                setSearchQuery(tagText);
                handleExecuteSearch(tagText, selectedCategory);
              }}
            >
              {tagText}
            </Tag>
          ))}
          {isSearching && (
            <Button
              type="link"
              size="small"
              icon={<ClearOutlined />}
              onClick={handleClearSearch}
              style={{ color: '#64748B', padding: 0 }}
            >
              Clear Search
            </Button>
          )}
        </div>
      </Card>

      {/* =========================================================================
          DYNAMIC SEARCH RESULTS OVERLAY (When User Actively Searches)
          ========================================================================= */}
      {isSearching && searchResults && (
        <Card
          style={{
            background: '#FFFFFF',
            borderColor: '#BAE0FF',
            borderRadius: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          }}
          styles={{ body: { padding: '24px 28px' } }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                Search & Matching Results for "{searchResults.query}"
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Found <strong>{searchResults.total}</strong> results: {searchResults.exact_count} exact,{' '}
                {searchResults.similar_count} similar, {searchResults.alternative_count || 0} alternatives
              </Text>
            </div>
            <Button icon={<ClearOutlined />} onClick={handleClearSearch}>
              Back to Recommended View
            </Button>
          </div>

          {/* Fallback Banner when No Exact Match Exists */}
          {!searchResults.has_exact_match && (
            <Alert
              style={{ marginBottom: 24, borderRadius: 8, background: '#FFFBEB', borderColor: '#FDE68A' }}
              type="warning"
              showIcon
              message={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <strong>
                      {searchResults.suggestion_message ||
                        "We couldn't find a product that fully matches your requirements. You can create a custom demand and connect with verified merchants."}
                    </strong>
                    <div style={{ fontSize: 12.5, color: '#475569', marginTop: 2 }}>
                      Inspect the similar and alternative products below, or initiate a demand pool to invite certified merchant bids.
                    </div>
                  </div>
                  <Button
                    type="primary"
                    icon={<AppstoreAddOutlined />}
                    onClick={() => handleRedirectToCustomDemand(searchResults.query)}
                    style={{ background: '#1677FF', borderRadius: 6, fontWeight: 600 }}
                  >
                    Create Custom Demand
                  </Button>
                </div>
              }
            />
          )}

          {/* Tier A: Exact Matches */}
          {searchResults.exact_matches.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <CheckCircleOutlined style={{ color: '#059669', fontSize: 18 }} />
                <Title level={5} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                  A. Exact Matches ({searchResults.exact_matches.length})
                </Title>
                <Tag color="success" style={{ borderRadius: 10, fontWeight: 600 }}>
                  100% Spec Match
                </Tag>
              </div>
              <Row gutter={[16, 16]}>
                {searchResults.exact_matches.map((item) =>
                  renderProductCard(item, {
                    label: 'Exact Match',
                    color: 'green',
                    explanation: item.compatibility_explanation || 'Direct specification hit',
                  })
                )}
              </Row>
            </div>
          )}

          {/* Tier B: Highly Similar Products */}
          {searchResults.similar_matches.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <ThunderboltOutlined style={{ color: '#1677FF', fontSize: 18 }} />
                <Title level={5} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                  B. Highly Similar Products ({searchResults.similar_matches.length})
                </Title>
                <Tag color="blue" style={{ borderRadius: 10, fontWeight: 600 }}>
                  Equivalent Specifications
                </Tag>
              </div>
              <Row gutter={[16, 16]}>
                {searchResults.similar_matches.map((item) =>
                  renderProductCard(item, {
                    label: 'Similar Match',
                    color: 'blue',
                    explanation: item.compatibility_explanation || 'Functionally equivalent variant',
                  })
                )}
              </Row>
            </div>
          )}

          {/* Tier C: Alternative Products */}
          {(searchResults.alternative_matches || []).length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <SwapOutlined style={{ color: '#FA8C16', fontSize: 18 }} />
                <Title level={5} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                  C. Alternative Products ({(searchResults.alternative_matches || []).length})
                </Title>
                <Tag color="orange" style={{ borderRadius: 10, fontWeight: 600 }}>
                  Material / Capacity Variance
                </Tag>
              </div>
              <Row gutter={[16, 16]}>
                {(searchResults.alternative_matches || []).map((item) =>
                  renderProductCard(item, {
                    label: 'Alternative',
                    color: 'orange',
                    explanation: item.compatibility_explanation || 'Alternative material grade or capacity',
                  })
                )}
              </Row>
            </div>
          )}

          {/* Tier D: Related Products */}
          {(searchResults.related_matches || []).length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <AppstoreOutlined style={{ color: '#722ED1', fontSize: 18 }} />
                <Title level={5} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                  D. Related Products ({(searchResults.related_matches || []).length})
                </Title>
                <Tag color="purple" style={{ borderRadius: 10, fontWeight: 600 }}>
                  Related Sector Hardware
                </Tag>
              </div>
              <Row gutter={[16, 16]}>
                {(searchResults.related_matches || []).map((item) =>
                  renderProductCard(item, {
                    label: 'Related',
                    color: 'purple',
                    explanation: item.compatibility_explanation || 'Related category hardware',
                  })
                )}
              </Row>
            </div>
          )}

          {/* Fallback if zero items matched anywhere */}
          {searchResults.total === 0 && (
            <Empty
              description="No catalogue products matched this search."
              style={{ padding: '30px 0' }}
            >
              <Button
                type="primary"
                icon={<AppstoreAddOutlined />}
                size="large"
                onClick={() => handleRedirectToCustomDemand(searchResults.query)}
              >
                Initiate Custom Demand Pool for "{searchResults.query}"
              </Button>
            </Empty>
          )}
        </Card>
      )}

      {/* =========================================================================
          SECTION 2: RECOMMENDED FOR YOU (Personalized Product Recommendations)
          ========================================================================= */}
      <Card
        style={{ background: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 12 }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FireOutlined style={{ color: '#FF4D4F', fontSize: 20 }} />
              <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                Recommended for You
              </Title>
              <Tag color="volcano" style={{ borderRadius: 10, fontWeight: 600 }}>
                {user ? 'Personalized' : 'Top Highlights'}
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Selected from verified Supabase catalog inventory based on your procurement sectors and past demand history.
            </Text>
          </div>
          <Button type="link" onClick={() => navigate('/customer/catalogue')} style={{ fontWeight: 600 }}>
            View Full Catalogue &rarr;
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
          </div>
        ) : recommendedProducts.length === 0 ? (
          <Empty description="No recommended products available." />
        ) : (
          <Row gutter={[16, 16]}>
            {recommendedProducts.slice(0, 8).map((prod) => renderProductCard(prod))}
          </Row>
        )}
      </Card>

      {/* =========================================================================
          SECTION 3: BROWSE PRODUCTS BY CATEGORY
          ========================================================================= */}
      <Card
        style={{ background: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 12 }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AppstoreOutlined style={{ color: '#1677FF', fontSize: 20 }} />
              <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                Browse by Sector Category
              </Title>
            </div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Select a category to filter live catalogue items and discover certified merchant supply.
            </Text>
          </div>
        </div>

        <Row gutter={[16, 16]}>
          {categories.map((cat) => (
            <Col xs={12} sm={8} md={4} key={cat}>
              <Card
                hoverable
                style={{
                  textAlign: 'center',
                  borderRadius: 10,
                  borderColor: selectedCategory === cat ? '#1677FF' : '#E2E8F0',
                  background: selectedCategory === cat ? '#F0F7FF' : '#FAFBFC',
                  cursor: 'pointer',
                  height: '100%',
                }}
                styles={{ body: { padding: '18px 12px' } }}
                onClick={() => {
                  setSelectedCategory(cat);
                  handleExecuteSearch('', cat);
                }}
              >
                <div style={{ marginBottom: 10 }}>{getCategoryIcon(cat)}</div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: '#172B4D',
                    lineHeight: '18px',
                  }}
                >
                  {cat}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* =========================================================================
          SECTION 4: POPULAR AND RELEVANT PRODUCTS
          ========================================================================= */}
      <Card
        style={{ background: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 12 }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FireOutlined style={{ color: '#FAAD14', fontSize: 20 }} />
              <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                Popular & Highly Rated Products
              </Title>
            </div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Ranked by verified buyer reviews, inspection clearance scores, and active warehouse inventory.
            </Text>
          </div>
          <Button type="link" onClick={() => navigate('/customer/catalogue')} style={{ fontWeight: 600 }}>
            See All Popular &rarr;
          </Button>
        </div>

        <Row gutter={[16, 16]}>
          {popularProducts.slice(0, 4).map((prod) => renderProductCard(prod))}
        </Row>
      </Card>

      {/* =========================================================================
          SECTION 5: SIMILAR AND ALTERNATIVE PRODUCTS SHOWCASE
          ========================================================================= */}
      {(alternativesShowcase.similar.length > 0 || alternativesShowcase.alternatives.length > 0) && (
        <Card
          style={{
            background: 'linear-gradient(135deg, #FFFFFF 0%, #FAFBFC 100%)',
            borderColor: '#E2E8F0',
            borderRadius: 12,
          }}
          styles={{ body: { padding: '24px 28px' } }}
        >
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SwapOutlined style={{ color: '#1677FF', fontSize: 20 }} />
              <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                Smart Alternatives & Similar Specifications
              </Title>
              <Tag color="cyan" style={{ borderRadius: 10, fontWeight: 600 }}>
                AI Matching Engine
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Compare compatible hardware variations, upgraded material grades (e.g., SS 316 vs SS 304), and alternate capacities.
            </Text>
          </div>

          <Row gutter={[16, 16]}>
            {alternativesShowcase.alternatives.slice(0, 2).map((item) =>
              renderProductCard(item, {
                label: 'Alternative Grade',
                color: 'orange',
                explanation: item.compatibility_explanation || 'Alternative material specification',
              })
            )}
            {alternativesShowcase.similar.slice(0, 2).map((item) =>
              renderProductCard(item, {
                label: 'Similar Match',
                color: 'blue',
                explanation: item.compatibility_explanation || 'Functionally equivalent variant',
              })
            )}
          </Row>
        </Card>
      )}

      {/* =========================================================================
          SECTION 6: RECENTLY ADDED PRODUCTS
          ========================================================================= */}
      <Card
        style={{ background: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 12 }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockCircleOutlined style={{ color: '#52C41A', fontSize: 20 }} />
              <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                Recently Added to Marketplace
              </Title>
              <Tag color="green" style={{ borderRadius: 10, fontWeight: 600 }}>
                New Arrivals
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Chronologically listed products based on verified supplier intake and database timestamps.
            </Text>
          </div>
          <Button type="link" onClick={() => navigate('/customer/catalogue')} style={{ fontWeight: 600 }}>
            Explore All New Arrivals &rarr;
          </Button>
        </div>

        <Row gutter={[16, 16]}>
          {recentlyAddedProducts.slice(0, 4).map((prod) => renderProductCard(prod))}
        </Row>
      </Card>

      {/* =========================================================================
          SECTION 7: YOUR MARKETPLACE ACTIVITY
          ========================================================================= */}
      <Card
        style={{ background: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 12 }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div style={{ marginBottom: 18 }}>
          <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
            Your Marketplace Activity
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Track active customer requests, merchant offers, purchase orders, and recently inspected products.
          </Text>
        </div>

        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={8}>
            <Card
              hoverable
              style={{ background: '#F8FAFC', borderColor: '#E2E8F0', borderRadius: 8, cursor: 'pointer' }}
              styles={{ body: { padding: 18 } }}
              onClick={() => navigate('/customer/demands')}
            >
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 13 }}>My Active Demands</Text>}
                value={activeDemands.length}
                prefix={<AppstoreAddOutlined style={{ color: '#1677FF', marginRight: 8 }} />}
                styles={{ content: { fontWeight: 700, color: '#172B4D' } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card
              hoverable
              style={{ background: '#F8FAFC', borderColor: '#E2E8F0', borderRadius: 8, cursor: 'pointer' }}
              styles={{ body: { padding: 18 } }}
              onClick={() => navigate('/customer/offers')}
            >
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 13 }}>Received Merchant Offers</Text>}
                value={offers.length}
                prefix={<TagsOutlined style={{ color: '#FAAD14', marginRight: 8 }} />}
                styles={{ content: { fontWeight: 700, color: '#172B4D' } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card
              hoverable
              style={{ background: '#F8FAFC', borderColor: '#E2E8F0', borderRadius: 8, cursor: 'pointer' }}
              styles={{ body: { padding: 18 } }}
              onClick={() => navigate('/customer/orders')}
            >
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 13 }}>Completed Orders</Text>}
                value={orders.length}
                prefix={<DollarOutlined style={{ color: '#52C41A', marginRight: 8 }} />}
                styles={{ content: { fontWeight: 700, color: '#172B4D' } }}
              />
            </Card>
          </Col>
        </Row>

        {/* Recently Viewed Products */}
        {recentlyViewed.length > 0 && (
          <div>
            <Divider style={{ margin: '14px 0 16px 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <EyeOutlined style={{ color: '#64748B' }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#334155' }}>
                Recently Viewed by You
              </span>
            </div>
            <Row gutter={[12, 12]}>
              {recentlyViewed.map((rv: any) => (
                <Col xs={12} sm={8} md={4} key={rv.id}>
                  <Card
                    hoverable
                    size="small"
                    style={{ borderRadius: 8, borderColor: '#E2E8F0', textAlign: 'center' }}
                    styles={{ body: { padding: 10 } }}
                    onClick={() => navigate(`/customer/products/${rv.id}`)}
                  >
                    <img
                      src={rv.image_url || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=120&q=80'}
                      alt={rv.name}
                      style={{ height: 60, width: '100%', objectFit: 'contain', marginBottom: 6 }}
                    />
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#172B4D',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rv.name}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1677FF', marginTop: 2 }}>
                      ${Number(rv.price || 0).toFixed(2)}
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        )}
      </Card>

      {/* =========================================================================
          SECTION 8: MY DEMANDS AND DEMAND GROUP PROGRESS (Secondary Section)
          ========================================================================= */}
      <Card
        style={{ background: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 12 }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Space>
            <AppstoreAddOutlined style={{ color: '#1677FF', fontSize: 18 }} />
            <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
              My Demands & Demand Group Progress
            </Title>
          </Space>
          <Button type="link" onClick={() => navigate('/customer/demands')} style={{ fontWeight: 600 }}>
            Manage Demands &rarr;
          </Button>
        </div>

        {activeDemands.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              background: '#FAFBFC',
              borderRadius: 8,
              border: '1px dashed #CBD5E1',
            }}
          >
            <Text type="secondary" style={{ fontSize: 13 }}>
              You have no active custom demands. Browse our commercial catalogue above to purchase immediately, or initiate a demand pool if unlisted.
            </Text>
          </div>
        ) : (
          <Table
            columns={demandColumns}
            dataSource={activeDemands}
            rowKey="id"
            pagination={false}
            size="middle"
          />
        )}

        {/* Fallback Custom Demand Promotion Banner */}
        <div
          style={{
            marginTop: 20,
            background: '#F0F7FF',
            border: '1px solid #BAE0FF',
            borderRadius: 8,
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <span style={{ fontWeight: 700, color: '#1E293B', fontSize: 13.5 }}>
              Need Custom Engineering Specifications or Unlisted OEM Components?
            </span>
            <div style={{ fontSize: 12.5, color: '#475569', marginTop: 2 }}>
              If available catalogue products and alternatives do not meet your mandatory criteria, create a custom demand pool to unlock competitive merchant bids.
            </div>
          </div>
          <Button
            type="primary"
            icon={<AppstoreAddOutlined />}
            onClick={() => handleRedirectToCustomDemand()}
            style={{ background: '#1677FF', borderRadius: 6, fontWeight: 600 }}
          >
            Create Custom Demand
          </Button>
        </div>
      </Card>

      {/* =========================================================================
          ORDER MODAL (Direct Purchase for In-Stock Items)
          ========================================================================= */}
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
                  'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=120&q=80'
                }
                alt={orderProduct.name}
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

export default CustomerDashboard;
