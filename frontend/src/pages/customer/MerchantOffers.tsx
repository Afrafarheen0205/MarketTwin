import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Typography, Modal, Alert, Rate, Row, Col, Descriptions, message, Checkbox } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { TagsOutlined, DiffOutlined, CheckCircleOutlined, SafetyCertificateOutlined, CarOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { fetchOffers } from '../../services/offerService';
import { createOrder } from '../../services/orderService';
import { supabase } from '../../services/supabase';

const { Title, Text, Paragraph } = Typography;

export const MerchantOffers: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const [approvingOffer, setApprovingOffer] = useState<any | null>(null);
  const [explicitConsent, setExplicitConsent] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadOffers = async () => {
    try { setOffers(await fetchOffers()); } finally { setLoading(false); }
  };

  useEffect(() => { loadOffers(); }, []);

  const handleApprove = async () => {
    if (!approvingOffer || !explicitConsent || !user || !supabase) return;
    await supabase.from('merchant_offers').update({ status: 'Customer Approved' }).eq('id', approvingOffer.id);
    await createOrder({
      order_number: `MT-ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      demand_id: approvingOffer.demand_id,
      demand_code: null,
      customer_id: user.id,
      product_name: approvingOffer.demand_title,
      merchant_id: approvingOffer.merchant_id,
      merchant_name: approvingOffer.merchant_name,
      quantity: 10,
      total_price: approvingOffer.unit_price * 10,
      status: 'Approved',
    });
    message.success(`Offer ${approvingOffer.offer_code} approved!`);
    setApprovingOffer(null);
    setExplicitConsent(false);
    loadOffers();
  };

  const columns: ColumnsType<any> = [
    { title: 'Offer Code', dataIndex: 'offer_code', key: 'offer_code', render: (code) => <Text strong style={{ color: '#1677FF' }}>{code}</Text> },
    { title: 'Merchant / Supplier', dataIndex: 'merchant_name', key: 'merchant_name', render: (name, record) => (<div><div style={{ fontWeight: 600 }}>{name}</div><div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}><Rate disabled defaultValue={record.merchant_rating} style={{ fontSize: 11, color: '#FAAD14' }} /><span style={{ fontSize: 11, color: '#6B778C' }}>{record.merchant_rating}</span></div></div>) },
    { title: 'Demand Item', dataIndex: 'demand_title', key: 'demand_title', render: (title) => <span style={{ fontWeight: 500 }}>{title}</span> },
    { title: 'Offered Price', dataIndex: 'unit_price', key: 'unit_price', render: (price, record) => (<div><span style={{ fontSize: 15, fontWeight: 700, color: '#172B4D' }}>${price}</span><div style={{ fontSize: 11, color: '#52C41A', fontWeight: 600 }}>Save ${record.original_target_price - price > 0 ? record.original_target_price - price : 25}/unit</div></div>) },
    { title: 'Delivery & Warranty', key: 'delivery', render: (_, record) => (<div><div><CarOutlined style={{ color: '#6B778C' }} /> {record.delivery_days} business days</div><div style={{ fontSize: 11, color: '#6B778C' }}>{record.warranty_months} months warranty</div></div>) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (status) => { let color = 'default'; if (status === 'Under Review') color = 'blue'; if (status === 'Customer Approved') color = 'green'; if (status === 'Rejected') color = 'red'; return <Tag color={color}>{status}</Tag>; } },
    { title: 'Actions', key: 'actions', render: (_, record) => (<Space>{record.status === 'Under Review' ? (<Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => { setApprovingOffer(record); setExplicitConsent(false); }}>Approve Offer</Button>) : (<Tag color="green">Approved & Gated</Tag>)}</Space>) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: '20px 24px' }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={16}><Title level={4} style={{ margin: 0, color: '#172B4D' }}>Competitive Merchant Offers</Title><Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13 }}>Compare eligible merchant proposals. Purchases are finalized only after explicit buyer approval.</Paragraph></Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}><Button type="primary" icon={<DiffOutlined />} size="large" onClick={() => navigate('/customer/compare')}>Open Offer Comparison Matrix</Button></Col>
        </Row>
      </Card>
      <Alert message="Buyer Protection & Explicit Approval Gating" description="Merchants submit bids to your demand pools. You are under no obligation to buy until you explicitly review and approve a proposal." type="success" showIcon icon={<SafetyCertificateOutlined style={{ color: '#52C41A' }} />} style={{ background: '#F6FFED', borderColor: '#B7EB8F' }} />
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 0 }}>
        {offers.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>No data available yet</div> : <Table columns={columns} dataSource={offers} rowKey="id" pagination={{ pageSize: 6 }} loading={loading} />}
      </Card>
      <Modal title={<Space><SafetyCertificateOutlined style={{ color: '#1677FF' }} /><span>Explicit Customer Approval Confirmation</span></Space>} open={Boolean(approvingOffer)} onCancel={() => { setApprovingOffer(null); setExplicitConsent(false); }} onOk={handleApprove} okText="Confirm & Approve Final Offer" okButtonProps={{ disabled: !explicitConsent, type: 'primary' }} width={650}>
        {approvingOffer && (<div style={{ padding: '12px 0' }}>
          <Alert message="Explicit Approval Requirement" description="Per MarketTwin requirements, you must explicitly approve the merchant's final terms before an order is placed." type="info" style={{ marginBottom: 16, background: '#F0F7FF', borderColor: '#BAE0FF' }} />
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Offer Code" span={2}><Text strong style={{ color: '#1677FF' }}>{approvingOffer.offer_code}</Text></Descriptions.Item>
            <Descriptions.Item label="Merchant"><strong>{approvingOffer.merchant_name}</strong> ({approvingOffer.merchant_rating} / 5.0)</Descriptions.Item>
            <Descriptions.Item label="Offered Unit Price"><strong style={{ color: '#52C41A', fontSize: 16 }}>${approvingOffer.unit_price}</strong></Descriptions.Item>
            <Descriptions.Item label="Delivery Window">{approvingOffer.delivery_days} Business Days</Descriptions.Item>
            <Descriptions.Item label="Warranty Term">{approvingOffer.warranty_months} Months Included</Descriptions.Item>
            <Descriptions.Item label="Shipping Terms" span={2}>{approvingOffer.shipping_terms}</Descriptions.Item>
          </Descriptions>
          <div style={{ background: '#FAFBFC', border: '1px solid #DFE1E6', borderRadius: 8, padding: '12px 16px' }}>
            <Checkbox checked={explicitConsent} onChange={(e) => setExplicitConsent(e.target.checked)}><span style={{ fontSize: 13, fontWeight: 600, color: '#172B4D' }}>I have reviewed all specifications and explicitly approve {approvingOffer.merchant_name}'s final offer of ${approvingOffer.unit_price}/unit.</span></Checkbox>
          </div>
        </div>)}
      </Modal>
    </div>
  );
};

export default MerchantOffers;