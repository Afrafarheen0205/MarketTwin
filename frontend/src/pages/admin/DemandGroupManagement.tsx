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
  Progress,
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
  TeamOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  ClusterOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

export const DemandGroupManagement: React.FC = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('demand_groups').select('*');
      setGroups(data ?? []);
    };
    load();
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('Today');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [syncing, setSyncing] = useState(false);
  const [viewingGroup, setViewingGroup] = useState<any | null>(null);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.success('Demand groups & clustering thresholds synced.');
    }, 600);
  };

  const filtered = groups.filter((g) => {
    const matchesSearch =
      g.productTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.groupCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || g.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesCat = categoryFilter === 'all' || g.category.toLowerCase() === categoryFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesCat;
  });

  const columns: ColumnsType<any> = [
    {
      title: 'Group Reference',
      dataIndex: 'groupCode',
      key: 'groupCode',
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
            <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{record.productTitle}</div>
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
          <span>Pool Volume / Threshold</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      key: 'volume',
      render: (_, r) => {
        const pct = Math.min(Math.round((r.totalQuantity / r.thresholdQuantity) * 100), 100);
        return (
          <div style={{ width: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span style={{ fontWeight: 600, color: '#172B4D' }}>{r.totalQuantity}/{r.thresholdQuantity} units</span>
              <span style={{ fontWeight: 700, color: pct >= 100 ? '#059669' : '#2563EB' }}>{pct}%</span>
            </div>
            <Progress
              percent={pct}
              size="small"
              strokeColor={pct >= 100 ? '#10B981' : '#1677FF'}
              trailColor="#F1F5F9"
              showInfo={false}
            />
          </div>
        );
      },
    },
    {
      title: (
        <Space size={4}>
          <span>Participants</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'participantsCount',
      key: 'participantsCount',
      render: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TeamOutlined style={{ color: '#64748B' }} />
          <span style={{ fontWeight: 600, color: '#172B4D' }}>{p} buyers</span>
        </div>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Collective Savings</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'estimatedSavings',
      key: 'estimatedSavings',
      render: (s) => <span style={{ fontWeight: 700, color: '#059669', fontSize: 13.5 }}>${s.toLocaleString()}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Pool Status</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const isGreen = status === 'Reviewing Offers' || status === 'Finalized';
        return (
          <span
            style={{
              backgroundColor: isGreen ? '#ECFDF5' : '#FFFBEB',
              color: isGreen ? '#059669' : '#D97706',
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
        <button
          onClick={() => setViewingGroup(record)}
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
          Audit Group
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* 1. Header (Overview + Sync / Help / Time Filter) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#172B4D', letterSpacing: -0.5 }}>
            Demand Group Governance & Clustering
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Supervise pooled buyer demands, aggregate threshold progression, and merchant bidding activation
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
            onClick={() => message.info('Demand pools aggregate multiple buyer orders to unlock tier-1 volume discounts.')}
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Active Demand Groups</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{groups.length}</span>
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
                &bull; Active Pools
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Total Aggregated Units</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                {groups.reduce((acc, g) => acc + g.totalQuantity, 0)}
              </span>
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
                +18 this week
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Average Pool Threshold</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>85%</span>
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
                <ArrowUpOutlined style={{ fontSize: 10, marginRight: 2 }} /> 4.2%
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Unlocked Bulk Savings</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                ${groups.reduce((acc, g) => acc + g.estimatedSavings, 0).toLocaleString()}
              </span>
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
                Collective
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
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Demand Pools</span>
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
              onClick={() => message.info('Triggering automated demand clustering algorithm across new submissions...')}
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
              <ClusterOutlined />
              <span>Run Clustering Engine</span>
            </button>
            <button
              onClick={() => message.success('Demand pooling report exported successfully.')}
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
              Export Report
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
              placeholder="Search demand pools by product or group code..."
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

          {/* Category Pill */}
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            className="filter-pill-select"
            style={{ width: 170 }}
            options={[
              { value: 'all', label: 'All Categories' },
              { value: 'office & workspace', label: 'Office & Workspace' },
              { value: 'commercial kitchen', label: 'Commercial Kitchen' },
              { value: 'energy & solar', label: 'Energy & Solar' },
            ]}
          />

          {/* Pool Status Pill */}
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="filter-pill-select"
            style={{ width: 170 }}
            options={[
              { value: 'all', label: 'All Bidding Status' },
              { value: 'active bidding', label: 'Active Bidding' },
              { value: 'reviewing offers', label: 'Reviewing Offers' },
              { value: 'finalized', label: 'Finalized' },
            ]}
          />

          {/* Reset Filters Pill */}
          {(searchTerm || statusFilter !== 'all' || categoryFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setCategoryFilter('all');
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
            {filtered.map((g) => {
              const pct = Math.min(Math.round((g.totalQuantity / g.thresholdQuantity) * 100), 100);
              return (
                <Col xs={24} sm={12} lg={8} key={g.id}>
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
                          {g.groupCode}
                        </span>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 12,
                            backgroundColor: g.status === 'Reviewing Offers' ? '#ECFDF5' : '#FFFBEB',
                            color: g.status === 'Reviewing Offers' ? '#059669' : '#D97706',
                          }}
                        >
                          {g.status}
                        </span>
                      </div>

                      <div style={{ fontWeight: 700, fontSize: 15, color: '#172B4D', marginBottom: 4 }}>
                        {g.productTitle}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                        {g.category} &bull; {g.participantsCount} verified buyers
                      </div>

                      <div style={{ marginBottom: 14, background: '#F8FAFC', padding: 12, borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#64748B' }}>Pool Target Progress</span>
                          <span style={{ fontWeight: 700, color: pct >= 100 ? '#059669' : '#2563EB' }}>
                            {g.totalQuantity} / {g.thresholdQuantity} ({pct}%)
                          </span>
                        </div>
                        <Progress
                          percent={pct}
                          size="small"
                          strokeColor={pct >= 100 ? '#10B981' : '#1677FF'}
                          trailColor="#E2E8F0"
                          showInfo={false}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>Est. Savings</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>
                            ${g.estimatedSavings.toLocaleString()}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: '#64748B' }}>Suppliers Bidding</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#172B4D' }}>
                            {g.offersCount} proposals
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setViewingGroup(g)}
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
                      Audit Group Details
                    </button>
                  </div>
                </Col>
              );
            })}
          </Row>
        )}
      </div>

      {/* 4. Group Audit Details Modal */}
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
                {viewingGroup?.productTitle}
              </div>
              <div style={{ fontSize: 11, color: '#64748B' }}>
                Group Code: <span style={{ color: '#7C3AED', fontWeight: 600 }}>{viewingGroup?.groupCode}</span>
              </div>
            </div>
          </div>
        }
        open={!!viewingGroup}
        onCancel={() => setViewingGroup(null)}
        footer={[
          <button
            key="close"
            onClick={() => setViewingGroup(null)}
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
            key="lock"
            onClick={() => {
              message.success(`Group ${viewingGroup?.groupCode} confirmed for merchant RFQ release.`);
              setViewingGroup(null);
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
            Authorize Merchant Bidding
          </button>,
        ]}
        width={640}
      >
        {viewingGroup && (
          <div style={{ marginTop: 16 }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Group Reference">{viewingGroup.groupCode}</Descriptions.Item>
              <Descriptions.Item label="Category">{viewingGroup.category}</Descriptions.Item>
              <Descriptions.Item label="Pooled Volume">{viewingGroup.totalQuantity} units</Descriptions.Item>
              <Descriptions.Item label="Threshold Target">{viewingGroup.thresholdQuantity} units</Descriptions.Item>
              <Descriptions.Item label="Participating Buyers">{viewingGroup.participantsCount} accounts</Descriptions.Item>
              <Descriptions.Item label="Current Bids">{viewingGroup.offersCount} supplier proposals</Descriptions.Item>
              <Descriptions.Item label="Collective Savings" span={2}>
                <span style={{ color: '#059669', fontWeight: 700 }}>
                  ${viewingGroup.estimatedSavings.toLocaleString()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Status" span={2}>
                <span
                  style={{
                    backgroundColor: viewingGroup.status === 'Reviewing Offers' ? '#ECFDF5' : '#FFFBEB',
                    color: viewingGroup.status === 'Reviewing Offers' ? '#059669' : '#D97706',
                    padding: '2px 10px',
                    borderRadius: 12,
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {viewingGroup.status}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16, background: '#F8FAFC', padding: 14, borderRadius: 10 }}>
              <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13, marginBottom: 4 }}>
                Algorithm Clustering Notes
              </div>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                All aggregated participant specifications have a cosine similarity index &gt; 88%. Delivery destinations are clustered in Zone 1 enabling combined freight dispatch.
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DemandGroupManagement;
