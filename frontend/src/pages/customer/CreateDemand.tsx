import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Steps, Form, Input, InputNumber, Select, DatePicker, Button, Row, Col, Typography, Space, Alert, Result, Divider, Tag, Radio } from 'antd';
import { AppstoreAddOutlined, DollarOutlined, TeamOutlined, CheckCircleOutlined, ThunderboltOutlined, ArrowLeftOutlined, ArrowRightOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import demandApi from '../../api/demandApi';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const CreateDemand: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialProduct = searchParams.get('product') || searchParams.get('search') || searchParams.get('q') || '';
  const initialCategory = searchParams.get('category') || 'Industrial Equipment';
  const initialPrice = Number(searchParams.get('price')) || 200;
  const initialDesc = searchParams.get('desc') || searchParams.get('description') || (initialProduct ? `Custom specifications and quality requirements for ${initialProduct}` : '');

  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  const [submitted, setSubmitted] = useState(false);
  const [createdDemand, setCreatedDemand] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    try {
      await form.validateFields();
      if (currentStep < 2) {
        setCurrentStep((prev) => prev + 1);
      } else {
        const values = form.getFieldsValue();
        if (!supabase || !user) { return; }
        setLoading(true);
        const payload = {
          product_name: values.title,
          category: values.category,
          description: values.description,
          quantity: values.targetQuantity,
          unit: 'units',
          target_unit_price: values.targetPrice,
          maximum_budget: values.targetQuantity * values.targetPrice,
          currency: 'USD',
          required_delivery_date: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
          expected_lead_time: values.leadTimeWeeks || 2,
          delivery_address: { shipping_terms: values.shippingTerms },
          additional_requirements: values.description,
        };
        try {
          const data = await demandApi.createDemand(payload);
          setCreatedDemand(data);
          setSubmitted(true);
        } catch (e) {
          // ignore
        } finally {
          setLoading(false);
        }
        return;
      }
    } catch {
      // validation error
    }
  };

  const handlePrev = () => setCurrentStep((prev) => prev - 1);

  if (submitted) {
    return (
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', padding: '30px 20px' }}>
        <Result status="success" title="Product Demand Created Successfully!" subTitle={<span>Demand Code: <strong>{createdDemand.demand_code}</strong>. Your demand has been registered.</span>} extra={[<Button type="primary" key="demands" onClick={() => navigate('/customer/demands')}>View My Demands</Button>, <Button key="groups" onClick={() => navigate('/customer/groups')}>Explore Demand Groups</Button>]}>
          <div style={{ maxWidth: 600, margin: '0 auto', background: '#F5F7FA', padding: 20, borderRadius: 8, textAlign: 'left' }}>
            <Title level={5} style={{ margin: 0, color: '#172B4D' }}>Demand Summary</Title>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><Text type="secondary">Product:</Text><Text strong>{createdDemand.title}</Text></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><Text type="secondary">Category:</Text><Tag color="blue">{createdDemand.category}</Tag></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><Text type="secondary">Your Quantity:</Text><Text strong>{createdDemand.target_quantity} units</Text></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><Text type="secondary">Target Unit Price:</Text><Text strong style={{ color: '#52C41A' }}>${createdDemand.target_price}</Text></div>
          </div>
        </Result>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: '20px 24px' } }}>
        <Title level={4} style={{ margin: 0, color: '#172B4D' }}>Create Product Demand</Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13 }}>Specify what you need. When similar demands are detected, MarketTwin groups buyers to attract competitive volume offers from certified merchants.</Paragraph>
      </Card>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 28 } }}>
        <Steps current={currentStep} style={{ marginBottom: 32 }} items={[{ title: 'Product Specification', icon: <AppstoreAddOutlined /> }, { title: 'Volume & Budget', icon: <DollarOutlined /> }, { title: 'Grouping & Review', icon: <TeamOutlined /> }]} />
        <Form form={form} layout="vertical" initialValues={{ title: initialProduct, category: initialCategory, targetQuantity: 5, targetPrice: initialPrice, description: initialDesc, qualityTier: 'Commercial / Enterprise', shippingTerms: 'Doorstep Delivery', leadTimeWeeks: 2, autoGroup: true }}>
          {currentStep === 0 && (<div>
            <Alert message="Specification Precision" description="Provide clear technical specifications and required certifications to help merchants evaluate manufacturing or wholesale feasibility." type="info" showIcon style={{ marginBottom: 20, background: '#F0F7FF', borderColor: '#BAE0FF' }} />
            <Row gutter={16}>
              <Col xs={24} md={16}><Form.Item name="title" label="Product Name / Demand Title" rules={[{ required: true, message: 'Please enter a demand title' }]}><Input placeholder="e.g. Ergonomic Office Mesh Chair with 4D Armrest" size="large" /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item name="category" label="Product Category" rules={[{ required: true, message: 'Please select category' }]}><Select size="large" options={[{ label: 'Office Furniture', value: 'Office Furniture' }, { label: 'Renewable Energy', value: 'Renewable Energy' }, { label: 'Commercial Kitchen', value: 'Commercial Kitchen' }, { label: 'Electronics', value: 'Electronics' }, { label: 'Food & Beverage', value: 'Food & Beverage' }, { label: 'Industrial Equipment', value: 'Industrial Equipment' }]} /></Form.Item></Col>
            </Row>
            <Form.Item name="description" label="Detailed Technical Specifications & Acceptance Criteria" rules={[{ required: true, message: 'Please enter technical specifications' }]}><TextArea rows={4} placeholder="Detail exact dimensions, materials, tolerances, certifications..." /></Form.Item>
            <Form.Item name="qualityTier" label="Target Quality Standard"><Radio.Group><Radio value="Standard Commercial">Standard Commercial</Radio><Radio value="Commercial / Enterprise">Enterprise Grade</Radio><Radio value="Premium Custom">Premium Custom Engineered</Radio></Radio.Group></Form.Item>
          </div>)}
          {currentStep === 1 && (<div>
            <Alert message="Target Pricing Guidance" description="Set your realistic target unit price. Setting a competitive target gives merchants a clear benchmark for volume bidding." type="warning" showIcon style={{ marginBottom: 20, background: '#FFFBE6', borderColor: '#FFE58F' }} />
            <Row gutter={16}>
              <Col xs={24} sm={12}><Form.Item name="targetQuantity" label="Your Desired Quantity (Units)" rules={[{ required: true, message: 'Quantity is required' }]}><InputNumber min={1} max={10000} style={{ width: '100%' }} size="large" /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="targetPrice" label="Target Unit Price ($ USD)" rules={[{ required: true, message: 'Target price is required' }]}><InputNumber min={1} prefix="$" style={{ width: '100%' }} size="large" /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12}><Form.Item name="deadline" label="Fulfillment Target Date"><DatePicker style={{ width: '100%' }} size="large" /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="shippingTerms" label="Preferred Delivery Method"><Select size="large" options={[{ label: 'Doorstep Pallet Delivery', value: 'Doorstep Delivery' }, { label: 'Warehouse / Dock Pickup', value: 'Warehouse Pickup' }, { label: 'Expedited Air Freight', value: 'Expedited Air' }]} /></Form.Item></Col>
            </Row>
          </div>)}
          {currentStep === 2 && (<div>
            <div style={{ background: '#F0F7FF', border: '1px solid #BAE0FF', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1677FF', fontWeight: 600 }}><ThunderboltOutlined /> MarketTwin Demand Grouping Engine</div>
              <Paragraph type="secondary" style={{ margin: '6px 0 0 0', fontSize: 13 }}>By default, compatible demands in your region and product category will be aggregated. Once the group volume threshold is reached, verified merchants receive immediate notification to submit competitive offers.</Paragraph>
            </div>
            <div style={{ background: '#F5F7FA', padding: 20, borderRadius: 8 }}>
              <Title level={5} style={{ marginTop: 0, color: '#172B4D' }}>Review Your Demand Submission</Title>
              <Divider style={{ margin: '12px 0' }} />
              <Row gutter={[16, 8]}>
                <Col span={12}><Text type="secondary">Demand Title:</Text></Col><Col span={12}><Text strong>{form.getFieldValue('title') || 'Custom Item'}</Text></Col>
                <Col span={12}><Text type="secondary">Category:</Text></Col><Col span={12}><Tag color="blue">{form.getFieldValue('category')}</Tag></Col>
                <Col span={12}><Text type="secondary">Desired Units:</Text></Col><Col span={12}><Text strong>{form.getFieldValue('targetQuantity')} units</Text></Col>
                <Col span={12}><Text type="secondary">Target Unit Price:</Text></Col><Col span={12}><Text strong style={{ color: '#52C41A' }}>${form.getFieldValue('targetPrice')}</Text></Col>
              </Row>
            </div>
          </div>)}
          <Divider style={{ margin: '24px 0 16px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button disabled={currentStep === 0} onClick={handlePrev} icon={<ArrowLeftOutlined />}>Previous</Button>
            <Button type="primary" onClick={handleNext} loading={loading} icon={currentStep === 2 ? <CheckCircleOutlined /> : <ArrowRightOutlined />}>{currentStep === 2 ? 'Submit Demand' : 'Next Step'}</Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default CreateDemand;