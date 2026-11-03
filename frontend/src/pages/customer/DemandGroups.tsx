import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Progress, Tag, Button, Typography, Space, Statistic, Modal, InputNumber, message } from 'antd';
import { TeamOutlined, DollarOutlined, ClockCircleOutlined, UsergroupAddOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { fetchDemandGroups } from '../../services/demandService';
import { supabase } from '../../services/supabase';

const { Title, Text, Paragraph } = Typography;

export const DemandGroups: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [joiningGroup, setJoiningGroup] = useState<any | null>(null);
  const [joinUnits, setJoinUnits] = useState<number>(5);
  const [loading, setLoading] = useState(true);

  const loadGroups = async () => {
    try { setGroups(await fetchDemandGroups()); } finally { setLoading(false); }
  };

  useEffect(() => { loadGroups(); }, []);

  const handleJoin = async () => {
    if (!joiningGroup || !user || !supabase) return;
    const { error } = await supabase.from('demand_group_members').insert({ group_id: joiningGroup.id, customer_id: user.id, quantity_committed: joinUnits });
    if (error) { message.error(error.message); return; }
    message.success(`Successfully committed ${joinUnits} units to ${joiningGroup.group_code}!`);
    setJoiningGroup(null);
    loadGroups();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: '20px 24px' }}>
        <Row justify="space-between" align="middle">
          <Col xs={24} md={16}><Title level={4} style={{ margin: 0, color: '#172B4D' }}>Demand Aggregation Groups</Title><Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13 }}>Buyers with compatible product requirements are pooled together. As aggregate quantity reaches volume thresholds, merchants submit deeper discounts.</Paragraph></Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}><Button type="primary" icon={<ThunderboltOutlined />} onClick={() => navigate('/customer/demands/create')}>Start New Group Demand</Button></Col>
        </Row>
      </Card>
      {groups.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>No data available yet</div> : (
        <Row gutter={[16, 16]}>
          {groups.map((group) => {
            const percent = group.threshold_quantity ? Math.min(Math.round((group.total_quantity / group.threshold_quantity) * 100), 100) : 0;
            const isThresholdMet = group.total_quantity >= group.threshold_quantity;
            return (
              <Col xs={24} md={12} key={group.id}>
                <Card style={{ background: '#FFFFFF', borderColor: isThresholdMet ? '#B7EB8F' : '#EBECF0', borderRadius: 8 }} hoverable bodyStyle={{ padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Space><Tag color="blue" style={{ fontSize: 12, padding: '2px 8px', fontWeight: 600 }}>{group.group_code}</Tag><Tag color="cyan">{group.category}</Tag></Space>
                    <Tag color={isThresholdMet ? 'green' : 'gold'}>{isThresholdMet ? 'Threshold Unlocked' : group.status}</Tag>
                  </div>
                  <div style={{ margin: '14px 0 8px 0' }}><Title level={5} style={{ margin: 0, color: '#172B4D' }}>{group.product_title}</Title></div>
                  <div style={{ background: '#F5F7FA', padding: 14, borderRadius: 8, margin: '12px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Group Volume: <strong>{group.total_quantity} units</strong></span><span style={{ color: '#6B778C' }}>Threshold: <strong>{group.threshold_quantity} units</strong></span></div>
                    <Progress percent={percent} status={isThresholdMet ? 'success' : 'active'} strokeColor={isThresholdMet ? '#52C41A' : '#1677FF'} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B778C', marginTop: 4 }}><span><TeamOutlined /> {group.participants_count} Verified Buyers</span><span><ClockCircleOutlined /> Closes: {group.deadline}</span></div>
                  </div>
                  <Row gutter={12} style={{ marginBottom: 16 }}>
                    <Col span={12}><div style={{ border: '1px solid #EBECF0', borderRadius: 6, padding: '8px 12px' }}><Text type="secondary" style={{ fontSize: 11 }}>Est. Group Savings</Text><div style={{ fontSize: 16, fontWeight: 700, color: '#52C41A' }}>${Number(group.estimated_savings).toLocaleString()}</div></div></Col>
                    <Col span={12}><div style={{ border: '1px solid #EBECF0', borderRadius: 6, padding: '8px 12px' }}><Text type="secondary" style={{ fontSize: 11 }}>Lowest Merchant Bid</Text><div style={{ fontSize: 16, fontWeight: 700, color: '#1677FF' }}>${group.lowest_offer_price}/unit</div></div></Col>
                  </Row>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Top Bidder: <strong>{group.top_offer_merchant || 'Bidding Open'}</strong></Text>
                    <Space>
                      <Button icon={<UsergroupAddOutlined />} onClick={() => setJoiningGroup(group)}>Commit Units</Button>
                      <Button type="primary" onClick={() => navigate('/customer/offers')}>Compare Bids ({group.offers_count})</Button>
                    </Space>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
      <Modal title={`Join Demand Group: ${joiningGroup?.group_code}`} open={Boolean(joiningGroup)} onCancel={() => setJoiningGroup(null)} onOk={handleJoin} okText="Confirm Commitment">
        {joiningGroup && (<div style={{ padding: '8px 0' }}>
          <Paragraph>Commit your required quantity to <strong>{joiningGroup.product_title}</strong>.</Paragraph>
          <div style={{ background: '#F5F7FA', padding: 14, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontSize: 13 }}>Target Price per Unit: <strong>${joiningGroup.lowest_offer_price}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span>Desired Units to Commit:</span><InputNumber min={1} max={100} value={joinUnits} onChange={(val) => setJoinUnits(val || 1)} size="middle" /></div>
          </div>
        </div>)}
      </Modal>
    </div>
  );
};

export default DemandGroups;