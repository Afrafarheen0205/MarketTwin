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
  Rate,
  Descriptions,
  message,
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
  PlusOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

export const MerchantManagement: React.FC = () => {
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('profiles').select('*').eq('role', 'merchant');
      setMerchants(data ?? []);
    };
    load();
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('Today');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [syncing, setSyncing] = useState(false);
  const [viewingMerchant, setViewingMerchant] = useState<any | null>(null);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.success('Supplier verification status and GMV audits synchronized.');
    }, 600);
  };

  const handleVerify = (id: string) => {
    setMerchants(
      merchants.map((m) =>
        m.id === id ? { ...m, status: 'Verified' } : m
      )
    );
    message.success('Merchant accredited and Tier 1 verified successfully.');
  };

  const filtered = merchants.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.contact.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesCat = categoryFilter === 'all' || m.category.toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesCat;
  });

  const columns: ColumnsType<any> = [
    {
      title: 'Merchant Supplier',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space size={12} align="center">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#ECFDF5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
              fontWeight: 700,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            ●
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{name}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>{record.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Primary Sector</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'category',
      key: 'category',
      render: (cat) => <span style={{ fontWeight: 500, color: '#172B4D' }}>{cat}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Supplier Rating</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'rating',
      key: 'rating',
      render: (r) => (
        <Space size={4} align="center">
          <Rate disabled defaultValue={r} style={{ fontSize: 11, color: '#F59E0B' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{r}</span>
        </Space>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Won Contracts</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'wonOrders',
      key: 'wonOrders',
      render: (won) => <span style={{ color: '#475569', fontSize: 13 }}>{won} Orders</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Fulfilled GMV</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'gmv',
      key: 'gmv',
      render: (gmv) => <span style={{ fontWeight: 700, color: '#059669', fontSize: 13.5 }}>${gmv.toLocaleString()}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Verification</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const isVer = status === 'Verified';
        return (
          <span
            style={{
              backgroundColor: isVer ? '#ECFDF5' : '#FEF3C7',
              color: isVer ? '#059669' : '#D97706',
              borderRadius: 16,
              padding: '2px 10px',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {status}
          </span>
        );
      },
    },
    {
      title: 'Action',
      key: 'action',
      align: 'right',
      render: (_, record) => (
        <Space size={8}>
          <button
            onClick={() => setViewingMerchant(record)}
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
            Audit
          </button>
          {record.status !== 'Verified' && (
            <button
              onClick={() => handleVerify(record.id)}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#059669',
                border: '1px solid #BBF7D0',
                borderRadius: 18,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Verify
            </button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* 1. Header (Overview + Sync / Help / Time Filter) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#172B4D', letterSpacing: -0.5 }}>
            Merchant Verification & Accreditation
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Review supplier credentials, accreditation tiers, fulfillment track record, and escrow GMV
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
                'Merchant Management: Verified suppliers gain priority access to high-volume pooled buyer demand clusters.'
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Verified Suppliers</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{merchants.length}</span>
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
                • Accredited
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Total Fulfilled GMV</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>$178,200</span>
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
                + Escrow
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Avg. Merchant Rating</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>4.85</span>
              <span style={{ color: '#64748B', fontSize: 13 }}>/ 5.0</span>
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
                <ArrowUpOutlined style={{ fontSize: 10 }} /> High Quality
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Fulfillment Rate</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>99.2%</span>
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

      {/* 3. Main Data Card: Merchant Suppliers */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 14,
          padding: '24px 24px 20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {/* Controls Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#0F172A' }}>Accredited Suppliers</span>

            <div
              style={{
                display: 'inline-flex',
                background: '#F1F5F9',
                borderRadius: 20,
                padding: 3,
                gap: 2,
              }}
            >
              <button
                onClick={() => setViewMode('list')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: viewMode === 'list' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'list' ? '#0F172A' : '#64748B',
                  borderRadius: 18,
                  padding: '4px 12px',
                  fontSize: 12.5,
                  fontWeight: viewMode === 'list' ? 600 : 500,
                  cursor: 'pointer',
                  boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <UnorderedListOutlined style={{ fontSize: 12 }} />
                <span>List View</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: viewMode === 'grid' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'grid' ? '#0F172A' : '#64748B',
                  borderRadius: 18,
                  padding: '4px 12px',
                  fontSize: 12.5,
                  fontWeight: viewMode === 'grid' ? 600 : 500,
                  cursor: 'pointer',
                  boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <AppstoreOutlined style={{ fontSize: 12 }} />
                <span>Grid View</span>
              </button>
            </div>
          </div>

          <Space size={10}>
            <button
              onClick={() => message.info('Supplier credential verification suite refreshed.')}
              style={{
                backgroundColor: '#0A101D',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 20,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>Accredit New Supplier</span>
            </button>

            <button
              onClick={() => navigate('/admin/dashboard')}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                border: '1px solid #CBD5E1',
                borderRadius: 20,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Overview
            </button>
          </Space>
        </div>

        {/* 5 Filter Pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Input
              placeholder="Search by company name or category"
              prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                borderRadius: 20,
                borderColor: '#E2E8F0',
                height: 38,
                fontSize: 13,
                backgroundColor: '#FFFFFF',
              }}
              allowClear
            />
          </div>

          <Select
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            style={{ width: 170 }}
            className="filter-pill-select"
            options={[
              { label: 'Status: All Suppliers', value: 'all' },
              { label: 'Verified', value: 'verified' },
              { label: 'Pending Verification', value: 'pending' },
            ]}
          />

          <Select
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
            style={{ width: 160 }}
            className="filter-pill-select"
            options={[
              { label: 'Sector: All Categories', value: 'all' },
              { label: 'Office Furniture', value: 'Office Furniture' },
              { label: 'Renewable Energy', value: 'Renewable Energy' },
              { label: 'Electronics', value: 'Electronics' },
            ]}
          />

          <Select
            defaultValue="all"
            style={{ width: 150 }}
            className="filter-pill-select"
            options={[
              { label: 'Rating: 4.8+ Stars', value: 'all' },
            ]}
          />
        </div>

        {/* View Layouts */}
        {viewMode === 'list' ? (
          <Table
            columns={columns}
            dataSource={filtered}
            rowKey="id"
            pagination={false}
            size="middle"
            className="market-offers-table"
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filtered.map((item) => (
              <Col xs={24} sm={12} lg={8} key={item.id}>
                <div
                  style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 16,
                    background: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{item.name}</span>
                      <span
                        style={{
                          backgroundColor: item.status === 'Verified' ? '#ECFDF5' : '#FEF3C7',
                          color: item.status === 'Verified' ? '#059669' : '#D97706',
                          borderRadius: 12,
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>{item.category}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12 }}>{item.email}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginBottom: 4 }}>
                      ${item.gmv.toLocaleString()} Fulfilled
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                      Won Contracts: {item.wonOrders} Orders &bull; Rating: {item.rating} / 5.0
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setViewingMerchant(item)}
                      style={{
                        flex: 1,
                        backgroundColor: '#0A101D',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 16,
                        padding: '6px 0',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Audit
                    </button>
                    {item.status !== 'Verified' && (
                      <button
                        onClick={() => handleVerify(item.id)}
                        style={{
                          flex: 1,
                          backgroundColor: '#FFFFFF',
                          color: '#059669',
                          border: '1px solid #BBF7D0',
                          borderRadius: 16,
                          padding: '6px 0',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Verify
                      </button>
                    )}
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* Audit Modal */}
      <Modal
        title="Supplier Verification & Escrow Audit"
        open={Boolean(viewingMerchant)}
        onCancel={() => setViewingMerchant(null)}
        footer={[
          <button
            key="close"
            onClick={() => setViewingMerchant(null)}
            style={{
              backgroundColor: '#0A101D',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 18,
              padding: '6px 18px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close Audit
          </button>,
        ]}
        width={580}
      >
        {viewingMerchant && (
          <div style={{ padding: '12px 0' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Company Name">{viewingMerchant.name}</Descriptions.Item>
              <Descriptions.Item label="Verification Status">
                <span
                  style={{
                    backgroundColor: viewingMerchant.status === 'Verified' ? '#ECFDF5' : '#FEF3C7',
                    color: viewingMerchant.status === 'Verified' ? '#059669' : '#D97706',
                    borderRadius: 12,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {viewingMerchant.status}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Primary Category" span={2}>
                {viewingMerchant.category}
              </Descriptions.Item>
              <Descriptions.Item label="Official Email" span={2}>
                {viewingMerchant.email}
              </Descriptions.Item>
              <Descriptions.Item label="Won Supply Contracts">{viewingMerchant.wonOrders}</Descriptions.Item>
              <Descriptions.Item label="Rating">{viewingMerchant.rating} / 5.0</Descriptions.Item>
              <Descriptions.Item label="Total Escrow GMV" span={2}>
                ${viewingMerchant.gmv.toLocaleString()} USD
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MerchantManagement;
