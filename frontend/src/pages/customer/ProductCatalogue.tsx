import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Input, Select, Button, Tag, Rate, Typography, Space, Empty, Alert } from 'antd';
import { SearchOutlined, FilterOutlined, AppstoreAddOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { fetchProducts } from '../../services/productService';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

export const ProductCatalogue: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('popular');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { setProducts(await fetchProducts()); } finally { setLoading(false); }
    };
    load();
  }, []);

  const categories = ['all', ...Array.from(new Set(products.map((p) => p.category)))];

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: '20px 24px' }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={14}><Title level={4} style={{ margin: 0, color: '#172B4D' }}>Standard Product Catalogue</Title><Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13 }}>Browse verified commercial catalog items. If your required model, customized specification, or volume tier is unavailable, you can initiate a targeted Demand.</Paragraph></Col>
          <Col xs={24} md={10} style={{ textAlign: 'right' }}><Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => navigate('/customer/demands/create')}>Can't Find? Create Demand</Button></Col>
        </Row>
      </Card>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: '16px 20px' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={10} md={8}><Search placeholder="Search products by title, category, or specs..." allowClear value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} prefix={<SearchOutlined style={{ color: '#6B778C' }} />} /></Col>
          <Col xs={12} sm={6} md={6}><Select style={{ width: '100%' }} value={selectedCategory} onChange={(val) => setSelectedCategory(val)} options={categories.map((c) => ({ label: c === 'all' ? 'All Categories' : c, value: c }))} suffixIcon={<FilterOutlined />} /></Col>
          <Col xs={24} sm={2} md={4} style={{ textAlign: 'right' }}><Text type="secondary" style={{ fontSize: 13 }}>Showing <strong>{filteredProducts.length}</strong> items</Text></Col>
        </Row>
      </Card>
      <Alert message={<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span><ThunderboltOutlined style={{ color: '#1677FF', marginRight: 8 }} /><strong>Demand-Driven Tip:</strong> Creating a custom demand unlocks merchant bidding and group discounts averaging 28% below standard retail catalog prices.</span><Button size="small" type="link" onClick={() => navigate('/customer/demands/create')}>Start a Demand &rarr;</Button></div>} type="info" style={{ background: '#F0F7FF', borderColor: '#BAE0FF' }} />
      {filteredProducts.length > 0 ? (
        <Row gutter={[16, 16]}>
          {filteredProducts.map((product) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={product.id}>
              <Card hoverable style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 8 }} cover={<div style={{ position: 'relative', height: 180, overflow: 'hidden', background: '#F5F7FA' }}><img alt={product.name} src={product.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><Tag color={product.in_stock ? 'green' : 'orange'} style={{ position: 'absolute', top: 10, right: 8, margin: 0, fontWeight: 600 }}>{product.in_stock ? 'In Stock' : 'Demand Only'}</Tag></div>} bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ fontSize: 11, color: '#6B778C', textTransform: 'uppercase', fontWeight: 600 }}>{product.category}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#172B4D', marginTop: 4, marginBottom: 8, height: 40, overflow: 'hidden', lineHeight: '20px' }} title={product.name}>{product.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}><Rate disabled defaultValue={product.rating} style={{ fontSize: 12, color: '#FAAD14' }} /><span style={{ fontSize: 12, color: '#6B778C' }}>({product.reviews_count})</span></div>
                <div style={{ background: '#F5F7FA', padding: '8px 10px', borderRadius: 6, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 11, color: '#6B778C' }}>Catalog Price:</span><span style={{ fontSize: 14, fontWeight: 700, color: '#172B4D' }}>${product.market_price}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}><span style={{ fontSize: 11, color: '#1677FF', fontWeight: 600 }}>Group Demand Target:</span><span style={{ fontSize: 13, fontWeight: 700, color: '#52C41A' }}>from ${product.min_demand_price}</span></div>
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                  <Button type="default" style={{ flex: 1 }} onClick={() => navigate(`/customer/products/${product.id}`)}>View Details</Button>
                  <Button type="primary" ghost style={{ flex: 1 }} icon={<AppstoreAddOutlined />} onClick={() => navigate(`/customer/demands/create?product=${encodeURIComponent(product.name)}`)}>Demand</Button>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Card style={{ background: '#FFFFFF', textAlign: 'center', padding: '40px 0' }}>
          <Empty description={<div><Title level={5} style={{ margin: '8px 0 4px 0' }}>No products available</Title><Text type="secondary">No catalog products found.</Text></div>} />
        </Card>
      )}
    </div>
  );
};

export default ProductCatalogue;