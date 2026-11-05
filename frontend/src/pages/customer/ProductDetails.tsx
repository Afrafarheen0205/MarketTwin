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
  Badge,
} from 'antd';
import {
  AppstoreAddOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  HomeOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { productApi, Product } from '../../api/productApi';

const { Title, Text, Paragraph } = Typography;

export const ProductDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      })
      .catch((err: any) => {
        console.error('Failed to load product details:', err);
        setErrorMsg(err.message || 'Product could not be retrieved.');
      })
      .finally(() => setLoading(false));
  }, [id]);

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
          subTitle={errorMsg || "The requested catalog item does not exist or is currently inactive."}
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
  const allImages = (product.images && product.images.length > 0)
    ? product.images
    : (product.image_url ? [product.image_url] : ['https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80']);

  const currentDisplayImg = selectedImage || allImages[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Breadcrumb Navigation */}
      <Breadcrumb
        items={[
          { title: <span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}><HomeOutlined /> Home</span> },
          { title: <span onClick={() => navigate('/customer/catalogue')} style={{ cursor: 'pointer' }}><ShopOutlined /> Product Catalogue</span> },
          { title: product.name },
        ]}
      />

      {/* Main Details Card */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} styles={{ body: { padding: 32 } }}>
        <Row gutter={[36, 36]}>
          {/* Left Column: Image Gallery */}
          <Col xs={24} md={10}>
            <div
              style={{
                borderRadius: 8,
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
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>

            {/* Thumbnail switcher if multiple images */}
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
                  {inStock ? 'In Stock & Ready' : 'Demand Gated'}
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
                {product.description || 'Verified commercial catalog component. Fully compliant with enterprise standard procurement standards and escrow payment gating.'}
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
                      Single-Unit Retail Price
                    </Text>
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#172B4D', marginTop: 2 }}>
                      ${retail.toFixed(2)}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11.5, color: '#94A3B8' }}>
                      Per {product.unit || 'unit'} catalog standard
                    </Text>
                  </Col>
                  <Col xs={12} style={{ borderLeft: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: '#1677FF', fontWeight: 600 }}>
                        Demand Pool Target
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
                      Unlocked with volume pooling
                    </Text>
                  </Col>
                </Row>
              </div>

              {/* Order Minimums & Inventory */}
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

              {/* Primary Call to Action Buttons */}
              <Space style={{ marginTop: 12 }} size={12} wrap>
                <Button
                  type="primary"
                  size="large"
                  icon={<AppstoreAddOutlined />}
                  onClick={() => navigate(`/customer/demands/create?product=${encodeURIComponent(product.name)}`)}
                  style={{ background: '#1677FF', borderRadius: 8, fontWeight: 600, height: 44, padding: '0 24px' }}
                >
                  Create Demand for Custom Specs / Bulk
                </Button>
                <Button
                  size="large"
                  icon={<TeamOutlined />}
                  onClick={() => navigate('/customer/groups')}
                  style={{ borderRadius: 8, height: 44 }}
                >
                  Explore Buyer Groups
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
          <Descriptions.Item label="Standard Unit">
            <strong>{product.unit || 'piece'}</strong>
          </Descriptions.Item>

          {/* Dynamic Technical Specs from JSONB */}
          {Object.entries(product.specifications || {}).map(([key, value]) => (
            <Descriptions.Item label={key} key={key}>
              <strong>{String(value)}</strong>
            </Descriptions.Item>
          ))}

          <Descriptions.Item label="Fulfillment Model">
            <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 600 }}>Direct Merchant Logistics</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Payment Protection">
            <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <SafetyCertificateOutlined /> Escrow & Post-Delivery Inspection Gated
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="Catalog Status">
            <Tag color={product.status === 'active' ? 'green' : 'default'} style={{ borderRadius: 6, fontWeight: 600 }}>
              {product.status?.toUpperCase() || 'ACTIVE'}
            </Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default ProductDetails;
