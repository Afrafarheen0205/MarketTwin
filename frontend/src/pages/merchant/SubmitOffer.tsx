import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Form, Input, InputNumber, Select, Button, Row, Col, Typography, Alert, Divider, Result, Descriptions, Space } from 'antd';
import { FileAddOutlined, DollarOutlined, CarOutlined, CheckCircleOutlined, ThunderboltOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import axiosClient from '../../api/axiosClient';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const SubmitOffer: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('group') || '';
  const [group, setGroup] = useState<any>(null);
  const [form] = Form.useForm();
  const [submitted, setSubmitted] = useState(false);
  const [createdOffer, setCreatedOffer] = useState<any>({});
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    const load = async () => {
      if (!supabase || !groupId) return;
      const { data } = await supabase.from('demand_groups').select('*').eq('id', groupId).single();
      setGroup(data);
      if (data) {
        form.setFieldsValue({
          unitPrice: (data.lowest_offer_price || 200) - 5,
          minOrderQuantity: Math.round((data.total_quantity || 1) * 0.5),
          deliveryDays: 7,
          warrantyMonths: 36,
          shippingTerms: 'Free freight pallet delivery with insurance included',
          specNotes: 'Full compliance with ANSI/BIFMA and ISO 9001 standards. Factory inspection reports attached.',
        });
      }
    };
    load();
  }, [groupId, form]);

  const onFinish = async (values: any) => {
    if (!supabase || !user || !group) return;
    setLoading(true);
    const payload = {
      offered_product_name: group.product_title,
      brand: null,
      model_number: null,
      description: values.specNotes,
      material: null,
      material_grade: null,
      specifications: {},
      certifications: [],
      compliance_notes: values.specNotes,
      offered_unit_price: values.unitPrice,
      currency: 'USD',
      tax_amount: 0,
      additional_charges: 0,
      shipping_cost: 0,
      final_quoted_amount: values.unitPrice * group.total_quantity,
      minimum_order_quantity: values.minOrderQuantity,
      available_quantity: group.total_quantity,
      production_lead_time: values.deliveryDays,
      dispatch_lead_time: values.deliveryDays,
      delivery_lead_time: values.deliveryDays,
      delivery_terms: values.shippingTerms,
      offer_valid_until: null,
      merchant_remarks: values.specNotes,
      merchant_name: user.user_metadata?.company || user.email,
      merchant_rating: 4.9,
    };
    try {
      const data = await axiosClient.post(`/api/v1/merchant/demand-groups/${group.id}/offers`, payload);
      setCreatedOffer(data.data);
      setSubmitted(true);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
    return;
  };

  if (submitted) {
    return (<Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', padding: 24 }}><Result status="success" title="Offer Submitted Successfully!" subTitle={<span>Offer Code: <strong>{createdOffer.offer_code}</strong>. Your proposal is now visible to customers.</span>} extra={[<Button type="primary" key="offers" onClick={() => navigate('/merchant/offers')}>View My Submitted Offers</Button>, <Button key="demands" onClick={() => navigate('/merchant/demands')}>Browse More Demands</Button>]} /></Card>);
  }

  if (!group) return <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>Loading demand pool...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/merchant/demands')}>Back to Demands</Button></div>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 28 } }}>
        <Title level={4} style={{ margin: 0, color: '#172B4D' }}>Submit Competitive Offer for {group.product_title}</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>Targeting Demand Pool: <strong>{group.group_code}</strong> ({group.total_quantity} units committed)</Text>
        <Divider style={{ margin: '18px 0' }} />
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Row gutter={20}>
            <Col xs={24} sm={12}><Form.Item name="unitPrice" label="Offered Wholesale Price Per Unit ($ USD)" rules={[{ required: true, message: 'Please provide unit price' }]}><InputNumber min={1} prefix="$" style={{ width: '100%' }} size="large" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="minOrderQuantity" label="Minimum Required Order Quantity (Units)" rules={[{ required: true, message: 'Please specify minimum units' }]}><InputNumber min={1} style={{ width: '100%' }} size="large" /></Form.Item></Col>
          </Row>
          <Row gutter={20}>
            <Col xs={24} sm={12}><Form.Item name="deliveryDays" label="Fulfillment Lead Time (Business Days)" rules={[{ required: true, message: 'Lead time is required' }]}><InputNumber min={1} max={90} style={{ width: '100%' }} size="large" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="warrantyMonths" label="Commercial Warranty Period (Months)" rules={[{ required: true, message: 'Warranty is required' }]}><InputNumber min={6} max={120} style={{ width: '100%' }} size="large" /></Form.Item></Col>
          </Row>
          <Form.Item name="shippingTerms" label="Logistics & Delivery Inclusions" rules={[{ required: true, message: 'Please enter shipping terms' }]}><Input size="large" /></Form.Item>
          <Form.Item name="specNotes" label="Technical Compliance & Material Specifications" rules={[{ required: true, message: 'Please explain compliance' }]}><TextArea rows={4} /></Form.Item>
          <Button type="primary" htmlType="submit" size="large" icon={<FileAddOutlined />} loading={loading}>Submit Formal Offer</Button>
        </Form>
      </Card>
    </div>
  );
};

export default SubmitOffer;