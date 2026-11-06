import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Row,
  Col,
  Card,
  Typography,
  Tag,
  Rate,
  Button,
  Descriptions,
  Divider,
  Space,
  Alert,
  Breadcrumb,
  Skeleton,
  Result,
  Modal,
  InputNumber,
  message,
  Tooltip,
} from 'antd';
import {
  AppstoreAddOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  HomeOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
  CarOutlined,
  CheckOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { productApi, Product, ProductMatchItem } from '../../api/productApi';
import { createOrder } from '../../services/orderService';

const { Title, Text, Paragraph } = Typography;

export const ProductDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [similarProducts, setSimilarProducts] = useState<ProductMatchItem[]>([]);
  const [alternativeProducts, setAlternativeProducts] = useState<ProductMatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Order Placement Modal
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderQty, setOrderQty] = useState<number>(1);
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);

    productApi
      .getProductById(id)
      .then((data) => {
        setProduct(data);
        const firstImg = data.images?.[0] || data.image_url || '';
        setSelectedImage(firstImg);
        setOrderQty(data.minimum_order_quantity || 1);

        // Record in customer recently viewed storage
        try {
          const storageKey = `markettwin_recent_views_${user?.id || 'guest'}`;
          const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
          const filtered = existing.filter((item: any) => item.id !== data.id);
          filtered.unshift({
            id: data.id,
            name: data.name,
            category: data.category,
            price: data.retail_price ?? data.market_price ?? 0,
            image_url: firstImg,
            viewed_at: new Date().toISOString(),
          });
          localStorage.setItem(storageKey, JSON.stringify(filtered.slice(0, 10)));
        } catch {
          // ignore localStorage error
        }

        // Fetch Similar and Alternative items
        return productApi.getSimilarAndAlternatives(data.id, 4);
      })
      .then((matches) => {
        if (matches) {
          setSimilarProducts(matches.similar || []);
          setAlternativeProducts(matches.alternatives || []);
        }
      })
      .catch((err: any) => {
        console.error('Failed to load product details:', err);
        setErrorMsg(err.message || 'Product could not be retrieved.');
      })
      .finally(() => setLoading(false));
  }, [id, user]);

  const handlePlaceOrder = async () => {
    if (!product || !user) {
      message.error('Please sign in as a verified customer to place an order.');
      return;
    }

    setOrderSubmitting(true);
    try {
      const unitPrice =
        orderQty >= 10
          ? product.wholesale_price || product.retail_price
          : product.retail_price;
      const totalAmount = unitPrice * orderQty;

      await createOrder({
        customer_id: user.id,
        product_title: product.name,
        quantity: orderQty,
        unit_price: unitPrice,
        total_amount: totalAmount,
        currency: 'USD',
        status: 'Confirmed',
        shipping_address: user.email || 'Customer Default Verified Logistics Address',
        created_at: new Date().toISOString(),
      });

      message.success(`Purchase confirmed! Your order for ${orderQty} ${product.unit || 'units'} has been placed.`);
      setOrderModalOpen(false);
      navigate('/customer/orders');
    } catch (err: any) {
      console.error('Order creation failed:', err);
      message.error(err.message || 'Failed to place order.');
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleCreateCustomDemand = () => {
    if (!product) return;
    const params = new URLSearchParams();
    params.append('product', product.name);
    params.append('category', product.category);
    params.append('price', String(product.wholesale_price || product.retail_price));
    params.append(
      'description',
      `Custom specification requested for ${product.name}. Model ${product.model_number || product.sku}. Specific quality, material, or certification requirements to be fulfilled.`
    );
    navigate(`/customer/demands/create?${params.toString()}`);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Skeleton active paragraph={{ rows: 2 }} />
        <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }}>
          <Row gutter={[32, 32]}>
            <Col xs={24} md={10}>
              <Skeleton.Image style={{ width: '100%', height: 380, borderRadius: 8 }} active />
            </Col>
            <Col xs={24} md={14}>
              <Skeleton active paragraph={{ rows: 8 }} />
            </Col>
          </Row>
        </Card>
      </div>
    );
  }

  if (errorMsg || !product) {
    return (
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10, padding: 30, textAlign: 'center' }}>
        <Result
          status="404"
          title="Product Not Found"
          subTitle={errorMsg || 'The requested catalog item does not exist or is currently inactive.'}
          extra={
            <Space>
              <Button type="primary" onClick={() => navigate('/customer/catalogue')}>
                Back to Catalogue
              </Button>
              <Button onClick={() => navigate('/customer/demands/create')}>
                Create Custom Demand
              </Button>
            </Space>
          }
        />
      </Card>
    );
  }

  const retail = product.retail_price ?? product.market_price ?? 0;
  const wholesale = product.wholesale_price ?? product.min_demand_price ?? Math.round(retail * 0.75);
  const savingsPct = retail > 0 ? Math.round(((retail - wholesale) / retail) * 100) : 0;
  const inStock = product.status === 'active' && (product.available_quantity ?? 0) > 0;
  const allImages =
    product.images && product.images.length > 0
      ? product.images
      : product.image_url
      ? [product.image_url]
      : ['https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80'];

  const currentDisplayImg = selectedImage || allImages[0];

  const renderMiniProductCard = (item: ProductMatchItem, badgeColor: string, badgeLabel: string) => (
    <Col xs={24} sm={12} md={6} key={item.id}>
      <Card
        hoverable
        size="small"
        style={{
          borderRadius: 8,
          borderColor: '#E2E8F0',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
        styles={{ body: { padding: 14, display: 'flex', flexDirection: 'column', flex: 1 } }}
        onClick={() => navigate(`/customer/products/${item.id}`)}
      >
        <div style={{ position: 'relative', height: 120, background: '#F8FAFC', borderRadius: 6, marginBottom: 10 }}>
          <img
            src={item.images?.[0] || item.image_url || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=300&q=80'}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
          />
          <div style={{ position: 'absolute', top: 6, left: 6 }}>
            <Tag color={badgeColor} style={{ borderRadius: 8, fontWeight: 700, fontSize: 10, margin: 0 }}>
              {badgeLabel}
            </Tag>
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}>{item.brand || item.category}</div>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: '#172B4D',
            height: 36,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            margin: '4px 0 8px 0',
          }}
        >
          {item.name}
        </div>

        {item.compatibility_explanation && (
          <div
            style={{
              background: '#F1F5F9',
              padding: '4px 6px',
              borderRadius: 4,
              fontSize: 11,
              color: '#475569',
              marginBottom: 8,
            }}
          >
            {item.compatibility_explanation}
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <span style={{ fontSize: 10.5, color: '#94A3B8' }}>Retail: </span>
            <span style={{ fontWeight: 600, color: '#172B4D' }}>
              ${(item.retail_price ?? item.market_price ?? 0).toFixed(2)}
            </span>
          </div>
          <div style={{ fontWeight: 700, color: '#059669', fontSize: 13 }}>
            ${(item.wholesale_price ?? item.min_demand_price ?? 0).toFixed(2)}
          </div>
        </div>
      </Card>
    </Col>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Breadcrumb Navigation */}
      <Breadcrumb
        items={[
          { title: <span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}><HomeOutlined /> Home</span> },
          { title: <span onClick={() => navigate('/customer/dashboard')} style={{ cursor: 'pointer' }}><ShopOutlined /> Marketplace</span> },
          { title: <span onClick={() => navigate('/customer/catalogue')} style={{ cursor: 'pointer' }}>Catalogue</span> },
          { title: product.name },
        ]}
      />

      {/* Main Details Card */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 12 }} styles={{ body: { padding: 32 } }}>
        <Row gutter={[36, 36]}>
          {/* Left Column: Image Gallery */}
          <Col xs={24} md={10}>
            <div
              style={{
                borderRadius: 10,
                overflow: 'hidden',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                height: 380,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={currentDisplayImg}
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 16 }}
              />
            </div>

            {/* Thumbnail switcher */}
            {allImages.length > 1 && (
              <div style={{ display: 'flex', gap: 10, marginTop: 14, overflowX: 'auto', paddingBottom: 4 }}>
                {allImages.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedImage(img)}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 6,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: currentDisplayImg === img ? '2px solid #1677FF' : '1px solid #E2E8F0',
                      opacity: currentDisplayImg === img ? 1 : 0.7,
                      flexShrink: 0,
                    }}
                  >
                    <img src={img} alt={`thumb-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            )}
          </Col>

          {/* Right Column: Title, Metadata, Pricing, Actions */}
          <Col xs={24} md={14}>
            <Space orientation="vertical" size={14} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={8}>
                  <Tag color="blue" style={{ borderRadius: 12, fontWeight: 600, padding: '2px 10px' }}>
                    {product.category}
                  </Tag>
                  {product.brand && (
                    <Tag color="cyan" style={{ borderRadius: 12, fontWeight: 600 }}>
                      {product.brand}
                    </Tag>
                  )}
                </Space>
                <Tag color={inStock ? 'success' : 'warning'} style={{ borderRadius: 12, fontWeight: 600, padding: '2px 10px' }}>
                  {inStock ? 'In Stock & Dispatch Ready' : 'Demand Gated (Out of Stock)'}
                </Tag>
              </div>

              <Title level={3} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                {product.name}
              </Title>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Rate disabled defaultValue={product.rating ?? 4.9} style={{ fontSize: 13, color: '#FAAD14' }} />
                <span style={{ fontSize: 13, color: '#64748B' }}>
                  {product.rating ?? 4.9} ({product.reviews_count ?? 18} verified buyer ratings)
                </span>
                <span style={{ color: '#CBD5E1' }}>&bull;</span>
                <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 600 }}>
                  Model: {product.model_number || product.sku}
                </span>
              </div>

              <Paragraph style={{ fontSize: 14, color: '#475569', lineHeight: '22px', margin: '4px 0 10px 0' }}>
                {product.description ||
                  'Verified commercial catalog component. Fully compliant with enterprise standard procurement standards and escrow payment gating.'}
              </Paragraph>

              {/* Pricing Matrix Box */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '18px 22px',
                }}
              >
                <Row gutter={[20, 20]} align="middle">
                  <Col xs={12}>
                    <Text type="secondary" style={{ fontSize: 12, color: '#64748B' }}>
                      Standard Retail Price
                    </Text>
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#172B4D', marginTop: 2 }}>
                      ${retail.toFixed(2)}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11.5, color: '#94A3B8' }}>
                      Per {product.unit || 'unit'} commercial catalog
                    </Text>
                  </Col>
                  <Col xs={12} style={{ borderLeft: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: '#1677FF', fontWeight: 600 }}>
                        Volume Pooling Target
                      </Text>
                      {savingsPct > 0 && (
                        <Tag color="green" style={{ margin: 0, fontWeight: 700, borderRadius: 10 }}>
                          Save {savingsPct}%
                        </Tag>
                      )}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#059669', marginTop: 2 }}>
                      ${wholesale.toFixed(2)}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11.5, color: '#94A3B8' }}>
                      Unlocked with buyer grouping
                    </Text>
                  </Col>
                </Row>
              </div>

              {/* Order Minimums & Warehouse Inventory */}
              <Row gutter={[16, 16]} style={{ marginTop: 4 }}>
                <Col xs={12}>
                  <div style={{ fontSize: 12.5, color: '#64748B' }}>Minimum Order Quantity (MOQ):</div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#172B4D' }}>
                    {product.minimum_order_quantity ?? 1} {product.unit || 'pieces'}
                  </div>
                </Col>
                <Col xs={12}>
                  <div style={{ fontSize: 12.5, color: '#64748B' }}>Warehouse Inventory:</div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: inStock ? '#059669' : '#D97706' }}>
                    {product.available_quantity ?? 0} {product.unit || 'units'} available
                  </div>
                </Col>
              </Row>

              {/* Unavailable Explanation if Out of Stock */}
              {!inStock && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message="Item Currently Out of Stock"
                  description="This product is currently reserved or awaiting manufacturing batch runs. You can inspect similar and alternative products below, or initiate a custom demand to aggregate volume with certified merchants."
                  style={{ borderRadius: 8, background: '#FFFBEB', borderColor: '#FDE68A' }}
                />
              )}

              {/* Primary Call to Action Buttons */}
              <Space style={{ marginTop: 12 }} size={12} wrap>
                {inStock ? (
                  <Button
                    type="primary"
                    size="large"
                    icon={<ShoppingCartOutlined />}
                    onClick={() => setOrderModalOpen(true)}
                    style={{ background: '#1677FF', borderRadius: 8, fontWeight: 600, height: 46, padding: '0 28px' }}
                  >
                    Purchase / Order Now
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    size="large"
                    icon={<AppstoreAddOutlined />}
                    onClick={handleCreateCustomDemand}
                    style={{ background: '#1677FF', borderRadius: 8, fontWeight: 600, height: 46, padding: '0 28px' }}
                  >
                    Create Custom Demand for This Model
                  </Button>
                )}

                <Button
                  size="large"
                  icon={<TeamOutlined />}
                  onClick={() => navigate('/customer/groups')}
                  style={{ borderRadius: 8, height: 46 }}
                >
                  Explore Buyer Groups
                </Button>
                <Button
                  size="large"
                  icon={<AppstoreAddOutlined />}
                  onClick={handleCreateCustomDemand}
                  style={{ borderRadius: 8, height: 46 }}
                >
                  Request Bulk Quote
                </Button>
              </Space>
            </Space>
          </Col>
        </Row>

        <Divider style={{ margin: '32px 0 24px 0' }} />

        {/* Technical Specifications Section */}
        <Title level={5} style={{ color: '#172B4D', marginBottom: 18, fontWeight: 700 }}>
          Technical Specifications & Commercial Terms
        </Title>
        <Descriptions
          bordered
          size="middle"
          column={{ xs: 1, sm: 2, md: 3 }}
          style={{ background: '#FFFFFF', borderRadius: 8, overflow: 'hidden' }}
        >
          <Descriptions.Item label="Catalog SKU / Model">
            <strong>{product.model_number || product.sku}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="Manufacturer Brand">
            <strong>{product.brand || 'Enterprise Certified'}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="Sales Unit">
            <strong>{product.unit || 'piece'}</strong>
          </Descriptions.Item>

          {/* Dynamic Technical Specs from JSONB */}
          {Object.entries(product.specifications || {}).map(([key, value]) => (
            <Descriptions.Item label={key} key={key}>
              <strong>{String(value)}</strong>
            </Descriptions.Item>
          ))}

          <Descriptions.Item label="Delivery SLA">
            <span style={{ color: '#172B4D', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <CarOutlined style={{ color: '#1677FF' }} /> 3-5 Business Days (Standard Insured Freight)
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="Authorized Merchant">
            <Tag color="blue" style={{ borderRadius: 6, fontWeight: 600 }}>
              Verified ISO-9001 Supplier
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Payment Protection">
            <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <SafetyCertificateOutlined /> Escrow & Post-Delivery Inspection Gated
            </span>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Similar Products Recommendation Section */}
      {similarProducts.length > 0 && (
        <Card style={{ background: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 12 }} styles={{ body: { padding: '24px 28px' } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ThunderboltOutlined style={{ color: '#1677FF', fontSize: 18 }} />
                <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                  Highly Similar Products
                </Title>
                <Tag color="blue" style={{ borderRadius: 10, fontWeight: 600 }}>
                  Equivalent Functionality
                </Tag>
              </div>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Items matching the primary functional specifications and category of this product.
              </Text>
            </div>
          </div>
          <Row gutter={[16, 16]}>
            {similarProducts.map((p) => renderMiniProductCard(p, 'blue', 'Similar Match'))}
          </Row>
        </Card>
      )}

      {/* Alternative Products Recommendation Section */}
      {alternativeProducts.length > 0 && (
        <Card style={{ background: '#FFFFFF', borderColor: '#E2E8F0', borderRadius: 12 }} styles={{ body: { padding: '24px 28px' } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SwapOutlined style={{ color: '#FA8C16', fontSize: 18 }} />
                <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                  Alternative Products
                </Title>
                <Tag color="orange" style={{ borderRadius: 10, fontWeight: 600 }}>
                  Material / Capacity Variance
                </Tag>
              </div>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Alternative specifications such as higher material grades (e.g. SS 316), non-metallic variants, or different capacities.
              </Text>
            </div>
          </div>
          <Row gutter={[16, 16]}>
            {alternativeProducts.map((p) => renderMiniProductCard(p, 'orange', 'Alternative'))}
          </Row>
        </Card>
      )}

      {/* Order Confirmation Modal */}
      <Modal
        title={
          <Space>
            <ShoppingCartOutlined style={{ color: '#1677FF' }} />
            <span style={{ fontWeight: 700 }}>Place Commercial Order</span>
          </Space>
        }
        open={orderModalOpen}
        onCancel={() => setOrderModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setOrderModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={orderSubmitting}
            onClick={handlePlaceOrder}
            style={{ background: '#1677FF', fontWeight: 600 }}
          >
            Confirm Purchase & Schedule Delivery
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#172B4D' }}>{product.name}</div>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>
            Model: {product.model_number || product.sku} &bull; Sector: {product.category}
          </div>

          <Divider style={{ margin: '8px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Order Quantity:</span>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                MOQ: {product.minimum_order_quantity || 1} &bull; Warehouse stock: {product.available_quantity || 0}
              </div>
            </div>
            <InputNumber
              min={product.minimum_order_quantity || 1}
              max={product.available_quantity || 500}
              value={orderQty}
              onChange={(v) => setOrderQty(v || 1)}
              style={{ width: 100 }}
            />
          </div>

          <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
              <span style={{ color: '#64748B' }}>Unit Price:</span>
              <span style={{ fontWeight: 600 }}>
                $
                {(orderQty >= 10
                  ? product.wholesale_price || product.retail_price
                  : product.retail_price
                ).toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
              <span style={{ color: '#64748B' }}>Delivery SLA:</span>
              <span style={{ color: '#059669', fontWeight: 600 }}>3-5 Business Days (Insured)</span>
            </div>
            <Divider style={{ margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
              <strong style={{ color: '#172B4D' }}>Total Cost:</strong>
              <strong style={{ color: '#1677FF' }}>
                $
                {(
                  (orderQty >= 10
                    ? product.wholesale_price || product.retail_price
                    : product.retail_price) * orderQty
                ).toFixed(2)}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#059669' }}>
            <SafetyCertificateOutlined />
            <span>MarketTwin Escrow Gated: Funds released to merchant only upon inspection approval.</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProductDetails;
