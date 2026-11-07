import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Row,
  Col,
  Card,
  Typography,
  Button,
  Table,
  Tag,
  Input,
  Select,
  Space,
  Badge,
  Dropdown,
  Modal,
  message,
  Tooltip,
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
  EllipsisOutlined,
  FireOutlined,
  ArrowUpOutlined,
  StarFilled,
  LinkOutlined,
  CheckCircleOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { HealthResponse } from '../../types';
import axiosClient from '../../api/axiosClient';
import { fetchOrders, subscribeToOrders } from '../../services/orderService';

const { Title, Text } = Typography;

interface LayoutContextType {
  isBackendHealthy: boolean | null;
  healthData: HealthResponse | null;
  checkHealth: () => void;
}

interface OfferRow {
  id: string;
  name: string;
  iconBg: string;
  iconColor: string;
  payout: string;
  cap: string;
  channels: string[];
  targeting: string;
  epc: string;
  conv: string;
  status: 'Active' | 'Paused' | 'Pending';
}

interface ActivityRow {
  id: string;
  name: string;
  leadsDelivered: number;
  earnings: string;
  status: 'Active' | 'Paused';
}

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const context = useOutletContext<LayoutContextType>();

  const isBackendHealthy = context?.isBackendHealthy ?? true;
  const checkHealth = context?.checkHealth || (() => {});
  const [syncing, setSyncing] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [platformOrders, setPlatformOrders] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axiosClient.get('/api/v1/admin/dashboard/overview');
        setOverview(res.data);
      } catch (e) {}
      try {
        const ords = await fetchOrders();
        setPlatformOrders(ords || []);
      } catch (e) {}
    };
    load();

    const unsubscribe = subscribeToOrders(() => {
      fetchOrders()
        .then((ords) => setPlatformOrders(ords || []))
        .catch(() => {});
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // View mode switcher: List View vs Grid View
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Filters state
  const [searchKeyword, setSearchKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [payoutModelFilter, setPayoutModelFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('Today');

  // Selected offer modal for "Promote / Review"
  const [selectedOfferModal, setSelectedOfferModal] = useState<OfferRow | null>(null);
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);

  // Carousel dot state for Top Payout Offers card
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Sync handler (calls FastAPI backend and spins icon)
  const handleSync = async () => {
    setSyncing(true);
    await checkHealth();
    try {
      const ords = await fetchOrders();
      setPlatformOrders(ords || []);
    } catch (e) {}
    setSyncing(false);
    message.success('Overview metrics & platform order stream synced.');
  };

  // Main Offers Dataset (Styled exactly like the screenshot)
  const offersData: OfferRow[] = [
    {
      id: 'off-1',
      name: 'Car Insurance CPL – Tier 1',
      iconBg: '#EDE9FE',
      iconColor: '#7C3AED',
      payout: '$25/lead',
      cap: '500/day',
      channels: ['SMS', 'Email'],
      targeting: 'Age 25–55, Car Owners',
      epc: '$1.20',
      conv: '3.4%',
      status: 'Active',
    },
    {
      id: 'off-2',
      name: 'Loan CPL – Tier 2',
      iconBg: '#E0F2FE',
      iconColor: '#0284C7',
      payout: '$40/lead',
      cap: '800/day',
      channels: ['SMS', 'Email'],
      targeting: 'Age 30–60, DTI > 35%',
      epc: '$1.85',
      conv: '4.7%',
      status: 'Active',
    },
    {
      id: 'off-3',
      name: 'Health CPA – Gold Plan',
      iconBg: '#FEF3C7',
      iconColor: '#D97706',
      payout: '$85/acquisition',
      cap: '300/month',
      channels: ['Email'],
      targeting: 'Age 25–50, Families',
      epc: '$2.40',
      conv: '6.1%',
      status: 'Active',
    },
    {
      id: 'off-4',
      name: 'Commercial Solar Energy – Group B2B',
      iconBg: '#DCFCE7',
      iconColor: '#16A34A',
      payout: '$120/lead',
      cap: '250/week',
      channels: ['Direct', 'Email'],
      targeting: 'Commercial Rooftop Owners',
      epc: '$3.10',
      conv: '5.2%',
      status: 'Active',
    },
  ];

  // Activity Table Dataset
  const activityData: ActivityRow[] = [
    {
      id: 'act-1',
      name: 'Car Insurance CPL – Tier 1',
      leadsDelivered: 214,
      earnings: '$5,350',
      status: 'Active',
    },
    {
      id: 'act-2',
      name: 'Credit Card CPA – Platinum',
      leadsDelivered: 120,
      earnings: '$9,000',
      status: 'Paused',
    },
    {
      id: 'act-3',
      name: 'Loan Consolidation CPL',
      leadsDelivered: 310,
      earnings: '$12,400',
      status: 'Active',
    },
  ];

  // Top Payout carousel slides data
  const carouselOffers = [
    {
      tier: 'Tier 2',
      title: 'Loan Consolidation CPL',
      brand: 'Logoipsum',
      payout: '$40/lead',
      cap: '800/day',
    },
    {
      tier: 'Tier 1',
      title: 'Solar Inverter B2B Cluster',
      brand: 'Helios Industrial',
      payout: '$85/lead',
      cap: '400/day',
    },
    {
      tier: 'Gold',
      title: 'Executive Ergonomic Fleet',
      brand: 'Apex Solutions',
      payout: '$55/lead',
      cap: '600/day',
    },
  ];

  // Filtered rows
  const filteredOffers = offersData.filter((item) => {
    const matchesKeyword = item.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                           item.targeting.toLowerCase().includes(searchKeyword.toLowerCase());
    return matchesKeyword;
  });

  // Table columns matching screenshot layout
  const offerColumns: ColumnsType<OfferRow> = [
    {
      title: 'Offer',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space size={12} align="center">
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              backgroundColor: record.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: record.iconColor,
              fontWeight: 700,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            ●
          </div>
          <span style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{name}</span>
        </Space>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Payout</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'payout',
      key: 'payout',
      render: (payout) => <span style={{ fontWeight: 600, color: '#172B4D' }}>{payout}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Cap</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'cap',
      key: 'cap',
      render: (cap) => <span style={{ color: '#172B4D' }}>{cap}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Channels</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'channels',
      key: 'channels',
      render: (channels: string[]) => (
        <Space size={6}>
          {channels.map((ch) => (
            <span
              key={ch}
              style={{
                backgroundColor: '#F1F5F9',
                color: '#475569',
                borderRadius: 16,
                padding: '2px 10px',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {ch}
            </span>
          ))}
        </Space>
      ),
    },
    {
      title: 'Targeting',
      dataIndex: 'targeting',
      key: 'targeting',
      render: (tgt) => <span style={{ color: '#475569', fontSize: 13 }}>{tgt}</span>,
    },
    {
      title: 'Performance',
      key: 'performance',
      render: (_, record) => (
        <Space size={6}>
          <span
            style={{
              backgroundColor: '#ECFDF5',
              color: '#059669',
              borderRadius: 16,
              padding: '2px 8px',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            EPC: {record.epc}
          </span>
          <span
            style={{
              backgroundColor: '#ECFDF5',
              color: '#059669',
              borderRadius: 16,
              padding: '2px 8px',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            Conv: {record.conv}
          </span>
        </Space>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      align: 'right',
      render: (_, record) => (
        <button
          onClick={() => {
            setSelectedOfferModal(record);
            setIsPromoteModalOpen(true);
          }}
          style={{
            backgroundColor: '#0A101D',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 20,
            padding: '6px 16px',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1E293B')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0A101D')}
        >
          Start Promoting
        </button>
      ),
    },
  ];

  // Activity columns matching screenshot
  const activityColumns: ColumnsType<ActivityRow> = [
    {
      title: 'Offer',
      dataIndex: 'name',
      key: 'name',
      render: (name) => <span style={{ fontWeight: 500, color: '#172B4D', fontSize: 13 }}>{name}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Leads Delivered</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'leadsDelivered',
      key: 'leadsDelivered',
      render: (leads) => <span style={{ color: '#172B4D' }}>{leads}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Earnings To Date</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'earnings',
      key: 'earnings',
      render: (earn) => <span style={{ fontWeight: 600, color: '#172B4D' }}>{earn}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Status</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <span
          style={{
            backgroundColor: status === 'Active' ? '#ECFDF5' : '#FEF3C7',
            color: status === 'Active' ? '#059669' : '#D97706',
            borderRadius: 16,
            padding: '2px 10px',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {status}
        </span>
      ),
    },
  ];

  const currentCarouselOffer = carouselOffers[carouselIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* 1. Page Header (Overview + Sync / Help / Time Filter) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#172B4D', letterSpacing: -0.5 }}>
          Overview
        </Title>

        <Space size={10} align="center">
          {/* Sync Button with Spinning Refresh */}
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

          {/* Help Question Icon Button */}
          <button
            onClick={() => message.info('MarketTwin Admin: Overview aggregates live demand pools, merchant bidding tiers, and revenue velocity.')}
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

          {/* Time Filter Pill Dropdown */}
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

      {/* 2. Top 4 Metric KPI Cards (Expansive Desktop Scale matching reference) */}
      <Row gutter={[20, 20]}>
        {/* Card 1: Total Offers Available */}
        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 16,
              padding: '24px 28px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ color: '#475569', fontSize: 14.5, fontWeight: 600 }}>Total Offers Available</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 16, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{overview?.total_offers ?? 0}</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 16,
                  padding: '4px 10px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#059669' }} />
                Live
              </span>
            </div>
          </div>
        </Col>

        {/* Card 2: New Offers This Week */}
        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 16,
              padding: '24px 28px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ color: '#475569', fontSize: 14.5, fontWeight: 600 }}>New Offers This Week</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 16, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{overview?.pending_demands ?? 0}</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 16,
                  padding: '4px 10px',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                + New
              </span>
            </div>
          </div>
        </Col>

        {/* Card 3: Highest Payout Offer */}
        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 16,
              padding: '24px 28px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ color: '#475569', fontSize: 14.5, fontWeight: 600 }}>Highest Payout Offer</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 16, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>$85</span>
              <span style={{ color: '#64748B', fontSize: 14 }}>per lead</span>
              <span
                style={{
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  borderRadius: 16,
                  padding: '4px 10px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ArrowUpOutlined style={{ fontSize: 11 }} /> 1.76%
              </span>
            </div>
          </div>
        </Col>

        {/* Card 4: Your Active Offers */}
        <Col xs={24} sm={12} lg={6}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 16,
              padding: '24px 28px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ color: '#475569', fontSize: 14.5, fontWeight: 600 }}>Total Platform Orders</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 16, cursor: 'pointer' }} onClick={() => navigate('/admin/orders')} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                {platformOrders.length || overview?.completed_orders || 0}
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
                Live Sync
              </span>
            </div>
          </div>
        </Col>
      </Row>

      {/* 3. Main Data Card: Offers Section with View Toggles, Filter Pills, and Data Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 18,
          padding: '28px 32px 24px 32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {/* Section Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#0F172A' }}>Offers</span>

            {/* List View / Grid View Segmented Switcher */}
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
            {/* Promote an Offer (Primary Dark Button) */}
            <button
              onClick={() => setIsPromoteModalOpen(true)}
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
              <span>Promote an Offer</span>
            </button>

            {/* View All (Secondary Outline Pill Button) */}
            <button
              onClick={() => navigate('/admin/offers')}
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
              View All
            </button>
          </Space>
        </div>

        {/* Filter Bar: Horizontal Row of Pill Dropdowns */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          {/* Keyword Search Input */}
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Input
              placeholder="Search offers by keyword"
              prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
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

          {/* Category Filter */}
          <Select
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val)}
            style={{ width: 170 }}
            className="filter-pill-select"
            options={[
              { label: 'Category: Insurance, Loans..', value: 'all' },
              { label: 'Insurance', value: 'insurance' },
              { label: 'Loans & Mortgages', value: 'loans' },
              { label: 'Commercial CleanTech', value: 'solar' },
              { label: 'Office Hardware', value: 'furniture' },
            ]}
          />

          {/* Payout Model */}
          <Select
            value={payoutModelFilter}
            onChange={(val) => setPayoutModelFilter(val)}
            style={{ width: 150 }}
            options={[
              { label: 'Payout Model: CPC, CPL..', value: 'all' },
              { label: 'CPL (Cost Per Lead)', value: 'cpl' },
              { label: 'CPA (Acquisition)', value: 'cpa' },
              { label: 'Wholesale Group Tier', value: 'group' },
            ]}
          />

          {/* Payout Range */}
          <Select
            defaultValue="all"
            style={{ width: 160 }}
            options={[
              { label: 'Payout Range: Min-Max $', value: 'all' },
              { label: '$10 – $50', value: '10-50' },
              { label: '$50 – $100', value: '50-100' },
              { label: '$100+', value: '100+' },
            ]}
          />

          {/* Channel Type */}
          <Select
            defaultValue="all"
            style={{ width: 150 }}
            options={[
              { label: 'Channel Type: SMS, Email', value: 'all' },
              { label: 'SMS & Email', value: 'sms-email' },
              { label: 'Email Only', value: 'email' },
              { label: 'Direct Logistics', value: 'freight' },
            ]}
          />

          {/* Targeting */}
          <Select
            defaultValue="all"
            style={{ width: 140 }}
            options={[
              { label: 'Targeting: Age, Gender', value: 'all' },
              { label: 'Age 25–55', value: '25-55' },
              { label: 'Commercial B2B', value: 'b2b' },
              { label: 'Enterprise Fleet', value: 'fleet' },
            ]}
          />
        </div>

        {/* Data Table View */}
        {viewMode === 'list' ? (
          <Table
            columns={offerColumns}
            dataSource={filteredOffers}
            rowKey="id"
            pagination={false}
            size="middle"
            className="market-offers-table"
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredOffers.map((item) => (
              <Col xs={24} sm={12} lg={6} key={item.id}>
                <div
                  style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: 12,
                    padding: 16,
                    background: '#FFFFFF',
                  }}
                >
                  <Space style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        backgroundColor: item.iconBg,
                        color: item.iconColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                      }}
                    >
                      ●
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</span>
                  </Space>
                  <div style={{ fontSize: 18, fontWeight: 700, margin: '8px 0', color: '#0F172A' }}>
                    {item.payout}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                    Cap: {item.cap} &bull; {item.targeting}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedOfferModal(item);
                      setIsPromoteModalOpen(true);
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: '#0A101D',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 18,
                      padding: '6px 0',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Start Promoting
                  </button>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* 4. Bottom Split Section: Highlights & Recommendations (Left) vs Activity (Right) */}
      <Row gutter={[20, 20]}>
        {/* Left: Highlights & Recommendations */}
        <Col xs={24} lg={12}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Highlights & Recommendations</span>
              <button
                onClick={() => navigate('/admin/offers')}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: 20,
                  padding: '4px 14px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#0F172A',
                }}
              >
                View All
              </button>
            </div>

            <Row gutter={[16, 16]}>
              {/* Card 1: Top Payout Offers with Mesh Gradient Banner */}
              <Col xs={24} sm={12}>
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: 16,
                    padding: 16,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div>
                    {/* Header with Title + Ellipsis */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>💰</span> Top Payout Offers
                      </span>
                      <EllipsisOutlined style={{ color: '#94A3B8', fontSize: 16, cursor: 'pointer' }} />
                    </div>

                    {/* Gradient Hero Mesh Box */}
                    <div
                      style={{
                        height: 90,
                        borderRadius: 12,
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 50%, #818cf8 100%)',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'flex-start',
                        marginBottom: 14,
                        boxShadow: '0 4px 12px rgba(79, 70, 229, 0.15)',
                      }}
                    >
                      <span
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.25)',
                          backdropFilter: 'blur(4px)',
                          color: '#FFFFFF',
                          borderRadius: 14,
                          padding: '2px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {currentCarouselOffer.tier}
                      </span>
                    </div>

                    {/* Offer Title & Logo */}
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', marginBottom: 8 }}>
                      {currentCarouselOffer.title}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <Space size={6} align="center">
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: '#EF4444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFF',
                            fontSize: 9,
                            fontWeight: 700,
                          }}
                        >
                          ◆
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                          {currentCarouselOffer.brand}
                        </span>
                      </Space>
                      <span style={{ fontSize: 11, color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                        View <LinkOutlined style={{ fontSize: 10 }} />
                      </span>
                    </div>

                    {/* Payout & Cap Pills */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                      <div
                        style={{
                          flex: 1,
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: 8,
                          padding: '6px 8px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 10, color: '#64748B' }}>Payout</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>
                          {currentCarouselOffer.payout}
                        </div>
                      </div>
                      <div
                        style={{
                          flex: 1,
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: 8,
                          padding: '6px 8px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 10, color: '#64748B' }}>Cap</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                          {currentCarouselOffer.cap}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    {/* View Offer Button */}
                    <button
                      onClick={() => navigate('/admin/offers')}
                      style={{
                        width: '100%',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: 18,
                        padding: '6px 0',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: '#0F172A',
                        cursor: 'pointer',
                        marginBottom: 12,
                      }}
                    >
                      View Offer
                    </button>

                    {/* Carousel Dots */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                      {carouselOffers.map((_, idx) => (
                        <div
                          key={idx}
                          onClick={() => setCarouselIndex(idx)}
                          style={{
                            width: idx === carouselIndex ? 16 : 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: idx === carouselIndex ? '#0F172A' : '#CBD5E1',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </Col>

              {/* Card 2: Trending Offers */}
              <Col xs={24} sm={12}>
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: 16,
                    padding: 16,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FireOutlined style={{ color: '#EA580C' }} /> Trending Offers
                      </span>
                      <EllipsisOutlined style={{ color: '#94A3B8', fontSize: 16, cursor: 'pointer' }} />
                    </div>

                    {/* Item 1 */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ color: '#DC2626', fontSize: 12 }}>◆</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Logoipsum</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A', marginBottom: 6 }}>
                        Auto Loans CPL
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <span
                          style={{
                            backgroundColor: '#ECFDF5',
                            color: '#059669',
                            borderRadius: 14,
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <ArrowUpOutlined style={{ fontSize: 9 }} /> +42% seller growth this week
                        </span>
                      </div>
                      <button
                        onClick={() => navigate('/admin/offers')}
                        style={{
                          backgroundColor: '#0A101D',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: 16,
                          padding: '5px 14px',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Start Promoting
                      </button>
                    </div>

                    <div style={{ height: 1, backgroundColor: '#F1F5F9', margin: '12px 0' }} />

                    {/* Item 2 */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ color: '#7C3AED', fontSize: 12 }}>✳</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Logoipsum</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A', marginBottom: 6 }}>
                        Finance Tech CPL
                      </div>
                      <div>
                        <span
                          style={{
                            backgroundColor: '#ECFDF5',
                            color: '#059669',
                            borderRadius: 14,
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <ArrowUpOutlined style={{ fontSize: 9 }} /> +22% seller growth this week
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          </div>
        </Col>

        {/* Right: Activity Section */}
        <Col xs={24} lg={12}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Activity</span>
              <button
                onClick={() => navigate('/admin/orders')}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: 20,
                  padding: '4px 14px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#0F172A',
                }}
              >
                View All
              </button>
            </div>

            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 16,
                padding: '20px 20px 14px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              {/* Highlight Promo Banner: Purple/Blue Gradient Box */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #F5F3FF 0%, #EEF2FF 100%)',
                  border: '1px solid #E0E7FF',
                  borderRadius: 14,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      fontSize: 16,
                      boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)',
                    }}
                  >
                    ★
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, color: '#334155', fontWeight: 500 }}>
                      If you promote all recommended offers, you could earn up to
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 24, fontWeight: 800, color: '#4338CA' }}>$99</span>
                    <span style={{ fontSize: 12, color: '#6366F1', marginLeft: 4 }}>per week</span>
                  </div>
                  <button
                    onClick={() => message.success('Recommended campaigns queued for bulk promotion.')}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #C7D2FE',
                      borderRadius: 18,
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#4338CA',
                      cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    Promote All
                  </button>
                </div>
              </div>

              {/* Activity Data Table */}
              <Table
                columns={activityColumns}
                dataSource={activityData}
                rowKey="id"
                pagination={false}
                size="middle"
                className="activity-table"
              />
            </div>
          </div>
        </Col>
      </Row>

      {/* Promote an Offer Modal */}
      <Modal
        title={
          <Space>
            <ThunderboltFilled style={{ color: '#1677FF' }} />
            <span>Launch Offer Promotion</span>
          </Space>
        }
        open={isPromoteModalOpen}
        onCancel={() => {
          setIsPromoteModalOpen(false);
          setSelectedOfferModal(null);
        }}
        onOk={() => {
          message.success(`Offer campaign for "${selectedOfferModal?.name || 'Selected Offer'}" launched successfully!`);
          setIsPromoteModalOpen(false);
          setSelectedOfferModal(null);
        }}
        okText="Confirm & Activate Campaign"
      >
        <div style={{ padding: '12px 0' }}>
          <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 10, border: '1px solid #E2E8F0', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#64748B' }}>Target Campaign</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
              {selectedOfferModal?.name || 'Car Insurance CPL – Tier 1'}
            </div>
            <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginTop: 4 }}>
              Payout: {selectedOfferModal?.payout || '$25/lead'} &bull; Cap: {selectedOfferModal?.cap || '500/day'}
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#475569' }}>
            Broadcasting this campaign activates automated customer demand grouping algorithms, inviting qualified buyer pools and verified suppliers to participate.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default AdminDashboard;
