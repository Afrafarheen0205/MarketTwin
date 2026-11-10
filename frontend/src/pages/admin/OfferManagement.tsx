import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Row,
  Col,
  Typography,
  Table,
  Input,
  Select,
  Space,
  Dropdown,
  Modal,
  Descriptions,
  message,
  Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  SyncOutlined,
  QuestionCircleOutlined,
  DownOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

export const OfferManagement: React.FC = () => {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [merchantFilter, setMerchantFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('Today');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [syncing, setSyncing] = useState(false);
  const [viewingOffer, setViewingOffer] = useState<any | null>(null);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.info('Demo only. No offers were fetched or changed.');
    }, 600);
  };

  const filtered = offers.filter((o) => {
    const matchesSearch =
      o.offerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.merchantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.demandTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesMerchant = merchantFilter === 'all' || o.merchantName.toLowerCase() === merchantFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesMerchant;
  });

  const columns: ColumnsType<any> = [
    {
      title: 'Offer Code',
      dataIndex: 'offerCode',
      key: 'offerCode',
      render: (c, record) => (
        <Space size={12} align="center">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#EDE9FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7C3AED',
              fontWeight: 700,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            ●
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{c}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>
              For: <span style={{ fontWeight: 600, color: '#334155' }}>{record.demandTitle}</span>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Supplier Merchant</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'merchantName',
      key: 'merchantName',
      render: (m) => (
        <div>
          <div style={{ fontWeight: 600, color: '#172B4D' }}>{m}</div>
          <div style={{ fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 3 }}>
            <SafetyCertificateOutlined /> Verified Merchant
          </div>
        </div>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Unit / Total Price</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      key: 'price',
      render: (_, r) => (
        <div>
          <span style={{ fontWeight: 700, color: '#059669', fontSize: 13.5 }}>${r.unitPrice}</span>
          <span style={{ fontSize: 11, color: '#64748B', marginLeft: 4 }}>/ unit</span>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            Pool Total: <strong style={{ color: '#172B4D' }}>${r.totalOfferAmount.toLocaleString()}</strong>
          </div>
        </div>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Fulfillment Window</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      key: 'delivery',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#172B4D' }}>{r.deliveryDays} business days</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>{r.warrantyMonths}m manufacturer warranty</div>
        </div>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Customer Approval</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      render: (s) => {
        let bg = '#EFF6FF';
        let col = '#2563EB';
        if (s === 'Customer Approved') {
          bg = '#ECFDF5';
          col = '#059669';
        } else if (s === 'Under Review') {
          bg = '#FFFBEB';
          col = '#D97706';
        }
        return (
          <span
            style={{
              backgroundColor: bg,
              color: col,
              borderRadius: 16,
              padding: '2px 10px',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {s}
          </span>
        );
      },
    },
    {
      title: 'Action',
      key: 'action',
      align: 'right',
      render: (_, record) => (
        <button
          onClick={() => setViewingOffer(record)}
          style={{
            backgroundColor: '#0A101D',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 18,
            padding: '5px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1E293B')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0A101D')}
        >
          Audit Offer
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      <Alert type="warning" showIcon title="Demo layout - not live offer management" description="Metrics and controls below are illustrative. No audit, export, validation, or database changes are performed." />
      {/* 1. Header (Overview + Sync / Help / Time Filter) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#172B4D', letterSpacing: -0.5 }}>
            Merchant Offer Auditing & Trade Compliance
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Inspect submitted merchant proposals across active demand pools to verify price fairness, lead times, and trade compliance
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
            }}
            onClick={() => message.info('All offers submitted by merchants must comply with platform fair-pricing and SLA policies.')}
          >
            <QuestionCircleOutlined style={{ fontSize: 14 }} />
          </button>

          <Dropdown
            menu={{
              items: [
                { key: 'today', label: 'Today', onClick: () => setTimeRange('Today') },
                { key: 'week', label: 'This Week', onClick: () => setTimeRange('This Week') },
                { key: 'month', label: 'This Month', onClick: () => setTimeRange('This Month') },
              ],
            }}
            trigger={['click']}
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
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              padding: '18px 20px',
              position: 'relative',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Active Submitted Offers</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{offers.length}</span>
              <span
                style={{
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  borderRadius: 12,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                &bull; Live Proposals
              </span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              padding: '18px 20px',
              position: 'relative',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Average Discount Unlocked</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>28.4%</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 12,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <ArrowDownOutlined style={{ fontSize: 10, marginRight: 2 }} /> vs Catalog
              </span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              padding: '18px 20px',
              position: 'relative',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Suppliers Actively Bidding</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>3</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 12,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                100% Accredited
              </span>
            </div>
          </div>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              padding: '18px 20px',
              position: 'relative',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Approval Velocity</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>2.4 d</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 12,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <ArrowUpOutlined style={{ fontSize: 10, marginRight: 2 }} /> 94% approval
              </span>
            </div>
          </div>
        </Col>
      </Row>

      {/* 3. Main Data Card with Filter Pills & View Toggle */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {/* Card Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Supplier Offers</span>
            {/* View Mode Toggle Pill */}
            <div
              style={{
                display: 'inline-flex',
                background: '#F1F5F9',
                borderRadius: 20,
                padding: '2px 4px',
                gap: 2,
              }}
            >
              <button
                onClick={() => setViewMode('list')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 16,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: viewMode === 'list' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'list' ? '#0F172A' : '#64748B',
                  boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                <UnorderedListOutlined style={{ fontSize: 12 }} />
                <span>List View</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 16,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: viewMode === 'grid' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'grid' ? '#0F172A' : '#64748B',
                  boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                <AppstoreOutlined style={{ fontSize: 12 }} />
                <span>Grid View</span>
              </button>
            </div>
          </div>

          <Space size={10}>
            <button
              onClick={() => message.info('Enforcing platform price floor and delivery SLA audit checks...')}
              style={{
                backgroundColor: '#0A101D',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 20,
                padding: '7px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <SafetyCertificateOutlined />
              <span>Verify All Price Bounds</span>
            </button>
            <button
              onClick={() => message.info('Demo only. No export was generated.')}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#334155',
                border: '1px solid #CBD5E1',
                borderRadius: 20,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Export Matrix
            </button>
          </Space>
        </div>

        {/* Filter Pills Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 20,
          }}
        >
          {/* Keyword Search Pill */}
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Input
              placeholder="Search by offer code, merchant, or product..."
              prefix={<SearchOutlined style={{ color: '#94A3B8', marginRight: 4 }} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
              style={{
                borderRadius: 20,
                border: '1px solid #E2E8F0',
                padding: '6px 14px',
                fontSize: 13,
              }}
            />
          </div>

          {/* Status Pill */}
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="filter-pill-select"
            style={{ width: 180 }}
            options={[
              { value: 'all', label: 'All Gating Status' },
              { value: 'customer approved', label: 'Customer Approved' },
              { value: 'under review', label: 'Under Review' },
              { value: 'submitted', label: 'Submitted' },
            ]}
          />

          {/* Merchant Pill */}
          <Select
            value={merchantFilter}
            onChange={setMerchantFilter}
            className="filter-pill-select"
            style={{ width: 190 }}
            options={[
              { value: 'all', label: 'All Suppliers' },
              { value: 'apex ergonomics ltd', label: 'Apex Ergonomics' },
              { value: 'lumina tech systems', label: 'Lumina Tech' },
              { value: 'solardyne systems', label: 'Solardyne Systems' },
            ]}
          />

          {/* Reset Filters Pill */}
          {(searchTerm || statusFilter !== 'all' || merchantFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setMerchantFilter('all');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#6366F1',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Content View: Table or Grid */}
        {viewMode === 'list' ? (
          <div className="market-offers-table">
            <Table
              columns={columns}
              dataSource={filtered}
              rowKey="id"
              pagination={{ pageSize: 6, showSizeChanger: false }}
            />
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            {filtered.map((o) => (
              <Col xs={24} sm={12} lg={8} key={o.id}>
                <div
                  style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 18,
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#7C3AED',
                          backgroundColor: '#EDE9FE',
                          padding: '2px 8px',
                          borderRadius: 12,
                        }}
                      >
                        {o.offerCode}
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 12,
                          backgroundColor: o.status === 'Customer Approved' ? '#ECFDF5' : '#FFFBEB',
                          color: o.status === 'Customer Approved' ? '#059669' : '#D97706',
                        }}
                      >
                        {o.status}
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 15, color: '#172B4D', marginBottom: 4 }}>
                      {o.demandTitle}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                      Supplier: <strong style={{ color: '#172B4D' }}>{o.merchantName}</strong>
                    </div>

                    <div style={{ marginBottom: 14, background: '#F8FAFC', padding: 12, borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#64748B' }}>Unit Proposal</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>
                          ${o.unitPrice}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748B' }}>
                        <span>Total Escrow Value</span>
                        <strong style={{ color: '#172B4D' }}>${o.totalOfferAmount.toLocaleString()}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginBottom: 16 }}>
                      <span>Lead Time: <strong style={{ color: '#172B4D' }}>{o.deliveryDays}d</strong></span>
                      <span>Warranty: <strong style={{ color: '#172B4D' }}>{o.warrantyMonths}m</strong></span>
                    </div>
                  </div>

                  <button
                    onClick={() => setViewingOffer(o)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0A101D',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 18,
                      padding: '8px 0',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Audit Proposal Details
                  </button>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* 4. Offer Audit Details Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                backgroundColor: '#EDE9FE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7C3AED',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              ●
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#172B4D' }}>
                Offer Proposal Audit: {viewingOffer?.offerCode}
              </div>
              <div style={{ fontSize: 11, color: '#64748B' }}>
                Supplier: <span style={{ color: '#172B4D', fontWeight: 600 }}>{viewingOffer?.merchantName}</span>
              </div>
            </div>
          </div>
        }
        open={!!viewingOffer}
        onCancel={() => setViewingOffer(null)}
        footer={[
          <button
            key="close"
            onClick={() => setViewingOffer(null)}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#334155',
              border: '1px solid #CBD5E1',
              borderRadius: 18,
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              marginRight: 8,
            }}
          >
            Close
          </button>,
          <button
            key="approve"
            onClick={() => {
              message.info('Demo only. No offer was validated or certified.');
              setViewingOffer(null);
            }}
            style={{
              backgroundColor: '#0A101D',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 18,
              padding: '6px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Certify Trade Compliance
          </button>,
        ]}
        width={640}
      >
        {viewingOffer && (
          <div style={{ marginTop: 16 }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Offer Code">{viewingOffer.offerCode}</Descriptions.Item>
              <Descriptions.Item label="Target Demand">{viewingOffer.demandTitle}</Descriptions.Item>
              <Descriptions.Item label="Supplier">{viewingOffer.merchantName}</Descriptions.Item>
              <Descriptions.Item label="Submitted Date">{viewingOffer.submittedDate}</Descriptions.Item>
              <Descriptions.Item label="Unit Price">
                <span style={{ color: '#059669', fontWeight: 700 }}>${viewingOffer.unitPrice}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Total Contract Value">
                <span style={{ fontWeight: 700 }}>${viewingOffer.totalOfferAmount.toLocaleString()}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Delivery Window">{viewingOffer.deliveryDays} business days</Descriptions.Item>
              <Descriptions.Item label="Warranty Period">{viewingOffer.warrantyMonths} months comprehensive</Descriptions.Item>
              <Descriptions.Item label="Customer Gating Status" span={2}>
                <span
                  style={{
                    backgroundColor: viewingOffer.status === 'Customer Approved' ? '#ECFDF5' : '#FFFBEB',
                    color: viewingOffer.status === 'Customer Approved' ? '#059669' : '#D97706',
                    padding: '2px 10px',
                    borderRadius: 12,
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {viewingOffer.status}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16, background: '#F8FAFC', padding: 14, borderRadius: 10 }}>
              <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13, marginBottom: 4 }}>
                Supplier Trade Proposal Notes
              </div>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                {viewingOffer.specNotes || 'Includes manufacturer-backed warranty, batch QA certificates, and door-to-door insured freight forwarding.'}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OfferManagement;
