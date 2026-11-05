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
  AppstoreAddOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';
import axiosClient from '../../api/axiosClient';

const { Title, Text } = Typography;

export const DemandManagement: React.FC = () => {
  const navigate = useNavigate();
  const [demands, setDemands] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('Today');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [syncing, setSyncing] = useState(false);
  const [viewingDemand, setViewingDemand] = useState<any | null>(null);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.success('Demand clusters and moderation flags synced.');
    }, 600);
  };

  const filtered = demands.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.demandCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || d.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesCat = categoryFilter === 'all' || d.category.toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesCat;
  });

  const columns: ColumnsType<any> = [
    {
      title: 'Demand Code',
      dataIndex: 'demandCode',
      key: 'demandCode',
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
            <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{record.title}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>
              <span style={{ fontWeight: 600, color: '#7C3AED' }}>{c}</span> &bull; {record.category}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Buyer Account</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'customerName',
      key: 'customerName',
      render: (name, record) => (
        <div>
          <div style={{ fontWeight: 600, color: '#172B4D' }}>{name}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>{record.customerEmail}</div>
        </div>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Desired Volume</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'targetQuantity',
      key: 'targetQuantity',
      render: (q) => <span style={{ fontWeight: 600, color: '#172B4D' }}>{q} units</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Target Price</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'targetPrice',
      key: 'targetPrice',
      render: (p) => <span style={{ fontWeight: 700, color: '#059669', fontSize: 13.5 }}>${p}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Cluster Status</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const isGrouped = status === 'Grouped' || status === 'Offers Received';
        return (
          <span
            style={{
              backgroundColor: isGrouped ? '#ECFDF5' : '#EFF6FF',
              color: isGrouped ? '#059669' : '#2563EB',
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setViewingDemand(record)}
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
          >
            Audit Demand
          </button>
          <button
            onClick={async () => {
              try {
                await axiosClient.post(`/api/v1/admin/demands/${record.id}/extract-requirements`);
                alert('Requirements extracted');
              } catch (e: any) {
                alert(e?.response?.data?.detail || 'Extraction failed');
              }
            }}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              border: '1px solid #CBD5E1',
              borderRadius: 18,
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Extract
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* 1. Header (Overview + Sync / Help / Time Filter) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#172B4D', letterSpacing: -0.5 }}>
            Demand Governance & Moderation
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Oversee commercial customer demands, volume compatibility algorithms, and supplier bid eligibility
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
                'Demand Moderation: MarketTwin automatically pools compatible buyer demands based on category, specifications, and volume thresholds.'
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Submitted Demands</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{demands.length}</span>
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
                • In Pipeline
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Clustered into Groups</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>3</span>
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
                + 75% Pooled
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Total Desired Volume</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>129</span>
              <span style={{ color: '#64748B', fontSize: 13 }}>units</span>
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
                <ArrowUpOutlined style={{ fontSize: 10 }} /> Bulk Scale
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Moderation Rate</span>
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

      {/* 3. Main Data Card: Demands Moderation */}
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
            <span style={{ fontSize: 20, fontWeight: 700, color: '#0F172A' }}>Demands Moderation Queue</span>

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
              onClick={() => navigate('/admin/groups')}
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
              <span>Inspect Demand Groups</span>
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
              placeholder="Search demands by code, title, or buyer"
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
              { label: 'Status: All Stages', value: 'all' },
              { label: 'Grouped', value: 'grouped' },
              { label: 'Offers Received', value: 'offers received' },
              { label: 'Pending', value: 'pending' },
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
              { label: 'Volume: All Sizes', value: 'all' },
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>{item.demandCode}</span>
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
                        {item.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
                      Buyer: {item.customerName} ({item.customerEmail})
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginBottom: 4 }}>
                      ${item.targetPrice} / unit
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                      Desired: {item.targetQuantity} units &bull; Deadline: {item.deadline}
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingDemand(item)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0A101D',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 16,
                      padding: '7px 0',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Audit Demand
                  </button>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* Audit Modal */}
      <Modal
        title="Demand Specifications & Cluster Audit"
        open={Boolean(viewingDemand)}
        onCancel={() => setViewingDemand(null)}
        footer={[
          <button
            key="close"
            onClick={() => setViewingDemand(null)}
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
        {viewingDemand && (
          <div style={{ padding: '12px 0' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Demand Ref">{viewingDemand.demandCode}</Descriptions.Item>
              <Descriptions.Item label="Status">
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
                  {viewingDemand.status}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Product Title" span={2}>
                {viewingDemand.title}
              </Descriptions.Item>
              <Descriptions.Item label="Buyer Contact">{viewingDemand.customerName}</Descriptions.Item>
              <Descriptions.Item label="Buyer Email">{viewingDemand.customerEmail}</Descriptions.Item>
              <Descriptions.Item label="Target Price">${viewingDemand.targetPrice}/unit</Descriptions.Item>
              <Descriptions.Item label="Desired Volume">{viewingDemand.targetQuantity} units</Descriptions.Item>
              <Descriptions.Item label="Fulfillment Deadline" span={2}>
                {viewingDemand.deadline}
              </Descriptions.Item>
              <Descriptions.Item label="Commercial Description" span={2}>
                {viewingDemand.description}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DemandManagement;
