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
} from 'antd';
import {
  AppstoreAddOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text, Paragraph } = Typography;

export const ProductDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<any>(null);
  useEffect(() => {
    const load = async () => {
      if (!supabase || !id) return;
      const { data } = await supabase.from('products').select('*').eq('id', id).single();
      setProduct(data);
    };
    load();
  }, [id]);
  if (!product) return <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>No data available yet</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Return Button */}
      <div>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/customer/catalogue')}
        >
          Back to Catalogue
        </Button>
      </div>

      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 28 }}>
        <Row gutter={[32, 32]}>
          {/* Product Image */}
          <Col xs={24} md={10}>
            <div
              style={{
                borderRadius: 8,
                overflow: 'hidden',
                background: '#F5F7FA',
                border: '1px solid #EBECF0',
                height: 380,
              }}
            >
              <img
                src={product.image}
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </Col>

          {/* Product Info & Pricing */}
          <Col xs={24} md={14}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Tag color="blue">{product.category}</Tag>
                <Tag color={product.inStock ? 'green' : 'orange'}>
                  {product.inStock ? 'In Stock' : 'Demand Only'}
                </Tag>
              </div>

              <Title level={3} style={{ margin: 0, color: '#172B4D' }}>
                {product.name}
              </Title>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Rate disabled defaultValue={product.rating} style={{ fontSize: 14, color: '#FAAD14' }} />
                <span style={{ fontSize: 13, color: '#6B778C' }}>{product.rating} ({product.reviewsCount} verified reviews)</span>
                <span style={{ color: '#DFE1E6' }}>&bull;</span>
                <span style={{ fontSize: 12, color: '#6B778C' }}>SKU: {product.sku}</span>
              </div>

              <Paragraph type="secondary" style={{ fontSize: 14, margin: '8px 0' }}>
                {product.description}
              </Paragraph>

              {/* Pricing Matrix Card */}
              <div
                style={{
                  background: '#F5F7FA',
                  border: '1px solid #EBECF0',
                  borderRadius: 8,
                  padding: 18,
                  marginTop: 8,
                }}
              >
                <Row gutter={[16, 16]}>
                  <Col xs={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Standard Catalog Price</Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#172B4D' }}>
                      ${product.marketPrice}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Single unit price</Text>
                  </Col>
                  <Col xs={12} style={{ borderLeft: '1px solid #DFE1E6' }}>
                    <Text style={{ fontSize: 12, color: '#1677FF', fontWeight: 600 }}>Demand Group Target</Text>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#52C41A' }}>
                      ${product.minDemandPrice}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Save up to 30% in group volume</Text>
                  </Col>
                </Row>
              </div>

              {/* Demand Action Buttons */}
              <Space style={{ marginTop: 12 }} size={12}>
                <Button
                  type="primary"
                  size="large"
                  icon={<AppstoreAddOutlined />}
                  onClick={() => navigate(`/customer/demands/create?product=${encodeURIComponent(product.name)}`)}
                >
                  Create Demand for Custom Specs / Bulk
                </Button>
                <Button
                  size="large"
                  icon={<TeamOutlined />}
                  onClick={() => navigate('/customer/groups')}
                >
                  View Active Groups ({product.activeDemandsCount})
                </Button>
              </Space>
            </Space>
          </Col>
        </Row>

        <Divider style={{ margin: '28px 0' }} />

        {/* Technical Specifications */}
        <Title level={5} style={{ color: '#172B4D', marginBottom: 16 }}>
          Technical Specifications & Commercial Terms
        </Title>
        <Descriptions bordered size="middle" column={{ xs: 1, sm: 2, md: 3 }} style={{ background: '#FFFFFF' }}>
          {Object.entries(product.specs).map(([key, value]) => (
            <Descriptions.Item label={key} key={key}>
              <strong>{String(value)}</strong>
            </Descriptions.Item>
          ))}
          <Descriptions.Item label="Fulfillment Model">
            <Tag color="cyan">Direct Merchant Logistics</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Payment Security">
            <span style={{ color: '#52C41A', display: 'flex', alignItems: 'center', gap: 4 }}>
              <SafetyCertificateOutlined /> Escrow & Buyer Approval Gated
            </span>
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default ProductDetails;
