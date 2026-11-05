import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Row,
  Col,
  Typography,
  Space,
  Dropdown,
  Modal,
  Checkbox,
  message,
  Rate,
  Alert,
} from 'antd';
import {
  EyeOutlined,
  SyncOutlined,
  QuestionCircleOutlined,
  DownOutlined,
  CheckCircleOutlined,
  ArrowUpOutlined,
  TrophyOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

export const OfferComparison: React.FC = () => {
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<any | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [timeRange, setTimeRange] = useState('Today');

  const [comparisonOffers, setComparisonOffers] = useState<any[]>([]);
  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('merchant_offers').select('*').limit(3);
      setComparisonOffers(data ?? []);
    };
    load();
  }, []);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.success('Competitive proposal rankings refreshed.');
    }, 600);
  };

  const handleApproveFinal = () => {
    if (!selectedOffer || !confirmed) return;
    message.success(`Explicitly approved offer ${selectedOffer.offerCode} from ${selectedOffer.merchantName}!`);
    setSelectedOffer(null);
    setConfirmed(false);
    navigate('/customer/orders');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* 1. Header (Overview + Sync / Help / Time Filter) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#172B4D', letterSpacing: -0.5 }}>
            Offer Comparison Matrix
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Evaluate side-by-side merchant proposals and authorize explicit final order approval
          </Text>
        </div>

        <Space size={10} align="center">
          <button
            onClick={handleSync}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 20,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <span>Sync</span>
            <SyncOutlined spin={syncing} style={{ fontSize: 12, color: '#64748B' }} />
          </button>

          <button
            onClick={() =>
              message.info(
                'Comparison Matrix: Review pricing, warranties, lead times, and supplier trust scores before making your selection.'
              )
            }
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <QuestionCircleOutlined style={{ fontSize: 14 }} />
          </button>

          <Dropdown
            menu={{
              items: [
                { key: 'today', label: 'Today', onClick: () => setTimeRange('Today') },
                { key: 'week', label: 'This Week', onClick: () => setTimeRange('This Week') },
                { key: 'month', label: 'This Month', onClick: () => setTimeRange('This Month') },
                { key: 'all', label: 'All Time', onClick: () => setTimeRange('All Time') },
              ],
            }}
            placement="bottomRight"
          >
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 20,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: '#334155',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <span>{timeRange}</span>
              <DownOutlined style={{ fontSize: 10, color: '#94A3B8' }} />
            </button>
          </Dropdown>
        </Space>
      </div>

      {/* 2. Top 4 Metric KPI Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Comparing Proposals</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{comparisonOffers.length}</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 16,
                  padding: '2px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#059669' }} />
                • Active Bids
              </span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Lowest Offered Price</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>$185</span>
              <span
                style={{
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  borderRadius: 16,
                  padding: '2px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                + 34% Savings
              </span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Fastest Delivery</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>7 Days</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 16,
                  padding: '2px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <ArrowUpOutlined style={{ fontSize: 10 }} /> Express
              </span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Buyer Consent Gating</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>100%</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 16,
                  padding: '2px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Audited
              </span>
            </div>
          </div>
        </Col>
      </Row>

      {/* 3. Comparison Cards Grid */}
      <Row gutter={[20, 20]}>
        {comparisonOffers.map((offer, index) => {
          const isBestValue = index === 0;
          return (
            <Col xs={24} md={8} key={offer.id}>
              <div
                style={{
                  border: isBestValue ? '2px solid #2563EB' : '1px solid #E2E8F0',
                  borderRadius: 18,
                  backgroundColor: '#FFFFFF',
                  padding: '24px 22px',
                  boxShadow: isBestValue ? '0 8px 24px rgba(37, 99, 235, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%',
                  position: 'relative',
                }}
              >
                {isBestValue && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: '#2563EB',
                      color: '#FFFFFF',
                      borderRadius: 14,
                      padding: '3px 14px',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                    }}
                  >
                    <TrophyOutlined /> BEST VALUE PROPOSAL
                  </div>
                )}

                <div>
                  <div style={{ textAlign: 'center', marginTop: isBestValue ? 8 : 0, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>{offer.demandTitle}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: '4px 0' }}>
                      {offer.merchantName}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                      <Rate disabled defaultValue={offer.merchantRating} style={{ fontSize: 12, color: '#F59E0B' }} />
                      <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>({offer.merchantRating} / 5.0)</span>
                    </div>
                  </div>

                  {/* Price Banner */}
                  <div
                    style={{
                      background: isBestValue ? 'linear-gradient(135deg, #EFF6FF 0%, #EEF2FF 100%)' : '#F8FAFC',
                      border: isBestValue ? '1px solid #DBEAFE' : '1px solid #E2E8F0',
                      padding: '16px 14px',
                      borderRadius: 12,
                      textAlign: 'center',
                      marginBottom: 20,
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Offered Wholesale Unit Price</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#059669', margin: '2px 0' }}>
                      ${offer.unitPrice}
                    </div>
                    <span
                      style={{
                        backgroundColor: '#ECFDF5',
                        color: '#059669',
                        borderRadius: 12,
                        padding: '2px 10px',
                        fontSize: 11.5,
                        fontWeight: 700,
                        display: 'inline-block',
                      }}
                    >
                      Save ${Math.max(offer.originalTargetPrice - offer.unitPrice, 30)}/unit
                    </span>
                  </div>

                  {/* Feature Breakdown Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ color: '#64748B' }}>Delivery Lead Time:</span>
                      <strong style={{ color: '#0F172A' }}>{offer.deliveryDays} business days</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ color: '#64748B' }}>Manufacturer Warranty:</span>
                      <strong style={{ color: '#0F172A' }}>{offer.warrantyMonths} months comprehensive</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ color: '#64748B' }}>Min Order Volume:</span>
                      <strong style={{ color: '#0F172A' }}>{offer.minOrderQuantity} units</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748B' }}>Shipping Freight:</span>
                      <strong style={{ color: '#0F172A' }}>{offer.shippingTerms.slice(0, 26)}...</strong>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedOffer(offer);
                    setConfirmed(false);
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: isBestValue ? '#2563EB' : '#0A101D',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 20,
                    padding: '9px 0',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: isBestValue ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  Approve This Offer
                </button>
              </div>
            </Col>
          );
        })}
      </Row>

      {/* Explicit Approval Modal */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#059669' }} />
            <span>Explicit Customer Approval</span>
          </Space>
        }
        open={Boolean(selectedOffer)}
        onCancel={() => setSelectedOffer(null)}
        footer={[
          <button
            key="cancel"
            onClick={() => setSelectedOffer(null)}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: 18,
              padding: '6px 16px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              marginRight: 8,
            }}
          >
            Cancel
          </button>,
          <button
            key="approve"
            disabled={!confirmed}
            onClick={handleApproveFinal}
            style={{
              backgroundColor: confirmed ? '#059669' : '#CBD5E1',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 18,
              padding: '6px 20px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: confirmed ? 'pointer' : 'not-allowed',
            }}
          >
            Confirm & Place Group Order
          </button>,
        ]}
        width={580}
      >
        {selectedOffer && (
          <div style={{ padding: '12px 0' }}>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #E2E8F0', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#64748B' }}>Winning Supplier Proposal</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                {selectedOffer.merchantName} &mdash; ${selectedOffer.unitPrice}/unit
              </div>
              <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginTop: 4 }}>
                Demand: {selectedOffer.demandTitle} &bull; Delivery: {selectedOffer.deliveryDays} Days
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              MarketTwin's core governance requires explicit customer approval before any contract binding or funds transfer occurs.
            </p>

            <div style={{ marginTop: 16, padding: '12px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
              <Checkbox
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: '#065F46' }}>
                  I explicitly approve this offer ({selectedOffer.offerCode}) and agree to the specified fulfillment lead time of {selectedOffer.deliveryDays} days.
                </span>
              </Checkbox>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OfferComparison;
