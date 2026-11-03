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
  PlusOutlined,
  UserOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

export const CustomerManagement: React.FC = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('Today');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [syncing, setSyncing] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<any | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!supabase) return;
      const { data } = await supabase.from('profiles').select('*').eq('role', 'customer');
      setCustomers(data ?? []);
    };
    load();
  }, []);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.success('Customer governance metrics synchronized.');
    }, 600);
  };

  const toggleStatus = (id: string) => {
    setCustomers(
      customers.map((c) => {
        if (c.id === id) {
          const nextStatus = c.status === 'Active' ? 'Suspended' : 'Active';
          message.info(`Customer ${c.name} account is now ${nextStatus}.`);
          return { ...c, status: nextStatus };
        }
        return c;
      })
    );
  };

  const filtered = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const columns: ColumnsType<any> = [
    {
      title: 'Customer Name',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
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
            <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{name}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>{record.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Company / Org</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'company',
      key: 'company',
      render: (c) => <span style={{ fontWeight: 500, color: '#172B4D' }}>{c}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Active Demands</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'activeDemands',
      key: 'activeDemands',
      render: (cnt) => (
        <span
          style={{
            backgroundColor: '#EFF6FF',
            color: '#2563EB',
            borderRadius: 14,
            padding: '2px 8px',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {cnt} Demands
        </span>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Approved Orders</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'approvedOrders',
      key: 'approvedOrders',
      render: (orders) => <span style={{ color: '#475569', fontSize: 13 }}>{orders} Orders</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Total Spent</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'totalSpent',
      key: 'totalSpent',
      render: (spent) => <span style={{ fontWeight: 700, color: '#059669', fontSize: 13.5 }}>${spent.toLocaleString()}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Account Status</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const isActive = status === 'Active';
        return (
          <span
            style={{
              backgroundColor: isActive ? '#ECFDF5' : '#FEF2F2',
              color: isActive ? '#059669' : '#DC2626',
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
            onClick={() => setViewingCustomer(record)}
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
          <button
            onClick={() => toggleStatus(record.id)}
            style={{
              backgroundColor: '#FFFFFF',
              color: record.status === 'Active' ? '#DC2626' : '#059669',
              border: `1px solid ${record.status === 'Active' ? '#FECACA' : '#BBF7D0'}`,
              borderRadius: 18,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {record.status === 'Active' ? 'Suspend' : 'Activate'}
          </button>
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
            Customer Accounts
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Manage registered commercial buyers, demand aggregation activity, and KYB authorization
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
                'Customer Governance: Audit buyer accounts, verify purchasing entities, and monitor demand grouping velocity.'
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Total Verified Customers</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{customers.length}</span>
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
                • Active
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Active Buyer Demands</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>7</span>
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
                + In Groups
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>Total Platform Spend</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>$104,200</span>
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
                <ArrowUpOutlined style={{ fontSize: 10 }} /> Escrow Funded
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
              <span style={{ color: '#475569', fontSize: 13, fontWeight: 500 }}>KYB Compliance</span>
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
                Verified
              </span>
            </div>
          </div>
        </Col>
      </Row>

      {/* 3. Main Data Card: Customer Accounts */}
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
            <span style={{ fontSize: 20, fontWeight: 700, color: '#0F172A' }}>Registered Commercial Buyers</span>

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
              onClick={() => message.info('Exporting customer compliance records as encrypted audit package.')}
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
              <span>Export Audit Data</span>
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
              placeholder="Search by name, company, or email"
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
              { label: 'Status: All Customers', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Suspended', value: 'suspended' },
            ]}
          />

          <Select
            defaultValue="all"
            style={{ width: 160 }}
            className="filter-pill-select"
            options={[
              { label: 'Spend: All Tiers', value: 'all' },
              { label: '$50k+ Spend', value: '50k' },
              { label: '$10k – $50k', value: 'mid' },
            ]}
          />

          <Select
            defaultValue="all"
            style={{ width: 150 }}
            className="filter-pill-select"
            options={[
              { label: 'Verification: KYB Pass', value: 'all' },
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
                          backgroundColor: item.status === 'Active' ? '#ECFDF5' : '#FEF2F2',
                          color: item.status === 'Active' ? '#059669' : '#DC2626',
                          borderRadius: 12,
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>{item.company}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12 }}>{item.email}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginBottom: 4 }}>
                      ${item.totalSpent.toLocaleString()} Spent
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                      Active: {item.activeDemands} Demands &bull; {item.approvedOrders} Approved Orders
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setViewingCustomer(item)}
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
                    <button
                      onClick={() => toggleStatus(item.id)}
                      style={{
                        flex: 1,
                        backgroundColor: '#FFFFFF',
                        color: item.status === 'Active' ? '#DC2626' : '#059669',
                        border: `1px solid ${item.status === 'Active' ? '#FECACA' : '#BBF7D0'}`,
                        borderRadius: 16,
                        padding: '6px 0',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {item.status === 'Active' ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* Audit Modal */}
      <Modal
        title="Customer Account KYB Audit"
        open={Boolean(viewingCustomer)}
        onCancel={() => setViewingCustomer(null)}
        footer={[
          <button
            key="close"
            onClick={() => setViewingCustomer(null)}
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
        {viewingCustomer && (
          <div style={{ padding: '12px 0' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Contact Name">{viewingCustomer.name}</Descriptions.Item>
              <Descriptions.Item label="Account Status">
                <span
                  style={{
                    backgroundColor: viewingCustomer.status === 'Active' ? '#ECFDF5' : '#FEF2F2',
                    color: viewingCustomer.status === 'Active' ? '#059669' : '#DC2626',
                    borderRadius: 12,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {viewingCustomer.status}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Company Entity" span={2}>
                {viewingCustomer.company}
              </Descriptions.Item>
              <Descriptions.Item label="Official Email" span={2}>
                {viewingCustomer.email}
              </Descriptions.Item>
              <Descriptions.Item label="Active Demands">{viewingCustomer.activeDemands}</Descriptions.Item>
              <Descriptions.Item label="Approved Orders">{viewingCustomer.approvedOrders}</Descriptions.Item>
              <Descriptions.Item label="Historical Spend" span={2}>
                ${viewingCustomer.totalSpent.toLocaleString()} USD
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CustomerManagement;
