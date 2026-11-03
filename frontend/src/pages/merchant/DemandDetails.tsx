import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Typography, Tag, Button, Row, Col, Progress, Divider, Space, Alert, Empty } from 'antd';
import { ArrowLeftOutlined, FileAddOutlined, TeamOutlined, ClockCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text, Paragraph } = Typography;

export const DemandDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !id) { setLoading(false); return; }
      const { data } = await supabase.from('demand_groups').select('*').eq('id', id).single();
      setGroup(data);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!group) return <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>No data available yet</div>;

  const percent = group.threshold_quantity ? Math.min(Math.round((group.total_quantity / group.threshold_quantity) * 100), 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/merchant/demands')}>Back to Available Demands</Button></div>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <Space style={{ marginBottom: 8 }}>
              <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>{group.group_code}</Tag>
              <Tag color="cyan">{group.category}</Tag>
              <Tag color="green">Open for Merchant Bidding</Tag>
            </Space>
            <Title level={3} style={{ margin: 0, color: '#172B4D' }}>{group.product_title}</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>Pool aggregation deadline: <strong>{group.deadline}</strong></Text>
          </div>
          <Button type="primary" size="large" icon={<FileAddOutlined />} onClick={() => navigate(`/merchant/offers/submit?group=${group.id}`)}>Submit Proposal for this Demand</Button>
        </div>
        <Divider style={{ margin: '20px 0' }} />
        <div style={{ background: '#F5F7FA', padding: 20, borderRadius: 8, marginBottom: 24 }}>
          <Row gutter={[24, 16]}>
            <Col xs={24} sm={8}>
              <Text type="secondary" style={{ fontSize: 12 }}>Aggregated Group Volume</Text>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#172B4D' }}>{group.total_quantity} units</div>
              <Progress percent={percent} strokeColor="#1677FF" size="small" style={{ marginTop: 6 }} />
              <div style={{ fontSize: 11, color: '#6B778C', marginTop: 4 }}>{group.participants_count} pooled verified business buyers</div>
            </Col>
            <Col xs={24} sm={8} style={{ borderLeft: '1px solid #DFE1E6' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Target Buyer Unit Price</Text>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#52C41A' }}>${group.lowest_offer_price}</div>
              <div style={{ fontSize: 11, color: '#6B778C', marginTop: 6 }}>Estimated total contract: ${(group.total_quantity * (group.lowest_offer_price || 100)).toLocaleString()}</div>
            </Col>
            <Col xs={24} sm={8} style={{ borderLeft: '1px solid #DFE1E6' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Competitive Status</Text>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1677FF' }}>{group.offers_count ?? 0} Bids Submitted</div>
              <div style={{ fontSize: 11, color: '#6B778C', marginTop: 6 }}>Top Merchant Bidder: {group.top_offer_merchant || 'Pending'}</div>
            </Col>
          </Row>
        </div>
        <Title level={5} style={{ marginBottom: 14 }}>Aggregated Technical Requirements</Title>
        <Descriptions bordered column={2} size="middle">
          <Descriptions.Item label="Target Quality Grade"><strong>Commercial / Industrial Grade</strong></Descriptions.Item>
          <Descriptions.Item label="Required Minimum Warranty"><strong>24 - 36 Months Commercial Warranty</strong></Descriptions.Item>
          <Descriptions.Item label="Packaging & Labeling">Individual barcoded units, palletized for freight dispatch</Descriptions.Item>
          <Descriptions.Item label="Logistics Acceptance Criteria">Direct doorstep freight with tracking verification</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
};

export default DemandDetails;