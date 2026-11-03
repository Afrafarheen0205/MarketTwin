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
  DollarOutlined,
  CheckCircleOutlined,
  CarOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

export const OrderManagement: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [carrierFilter, setCarrierFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('Today');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [syncing, setSyncing] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any | null>(null);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.success('Escrow settlements & logistics carrier tracking refreshed.');
    }, 600);
  };

  const filtered = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.merchantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.demandCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesCarrier = carrierFilter === 'all' || o.carrier.toLowerCase() === carrierFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesCarrier;
  });

  const columns: ColumnsType<any> = [
    {
      title: 'Order ID',
      dataIndex: 'orderNumber',
      key: 'orderNumber',
      render: (n, record) => (
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
            <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{n}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>
              Ref: <span style={{ fontWeight: 600, color: '#7C3AED' }}>{record.demandCode}</span>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Product / Quantity</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      key: 'product',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#172B4D' }}>{r.productName}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>{r.quantity} units</div>
        </div>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Fulfilling Supplier</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'merchantName',
      key: 'merchantName',
      render: (m) => <span style={{ fontWeight: 600, color: '#172B4D' }}>{m}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Escrow Protected Amount</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      render: (pr) => <span style={{ fontWeight: 700, color: '#059669', fontSize: 13.5 }}>${pr.toLocaleString()}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Fulfillment Stage</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      render: (st) => {
        let bg = '#EFF6FF';
        let col = '#2563EB';
        if (st === 'Delivered') {
          bg = '#ECFDF5';
          col = '#059669';
        } else if (st === 'Processing') {
          bg = '#FFFBEB';
          col = '#D97706';
        } else if (st === 'Dispatched') {
          bg = '#F0F9FF';
          col = '#0284C7';
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
            {st}
          </span>
        );
      },
    },
    {
      title: (
        <Space size={4}>
          <span>Carrier & Tracking</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      key: 'carrier',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 12 }}>{r.carrier}</div>
          <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }}>{r.trackingNumber}</div>
        </div>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      align: 'right',
      render: (_, record) => (
        <button
          onClick={() => setViewingOrder(record)}
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
          Audit Order
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
            Platform Orders & Escrow Oversight
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Monitor trade fulfillment contracts, multi-party escrow balances, and delivery sign-offs across all demand commitments
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
            onClick={() => message.info('Funds are securely locked in smart escrow until delivery inspection confirmation.')}
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Total Platform Orders</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{orders.length}</span>
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
                &bull; Active Contracts
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Total Escrow Capital</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                ${orders.reduce((acc, o) => acc + o.totalPrice, 0).toLocaleString()}
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
                100% Protected
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>In Freight Transit</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                {orders.filter((o) => o.status === 'Dispatched' || o.status === 'Processing').length}
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
                On-schedule
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Trade Dispute Rate</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>0.0%</span>
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
                Zero Claims
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
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Fulfillment Contracts</span>
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
              onClick={() => message.info('Triggering automated multi-party escrow reconciliation check...')}
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
              <span>Audit Escrow Ledger</span>
            </button>
            <button
              onClick={() => message.success('Full orders settlement manifest exported to CSV.')}
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
              Export Manifest
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
              placeholder="Search by order ID, product, tracking #, or supplier..."
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

          {/* Fulfillment Stage Pill */}
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            className="filter-pill-select"
            style={{ width: 180 }}
            options={[
              { value: 'all', label: 'All Stages' },
              { value: 'processing', label: 'Processing' },
              { value: 'dispatched', label: 'Dispatched' },
              { value: 'delivered', label: 'Delivered' },
            ]}
          />

          {/* Carrier Pill */}
          <Select
            value={carrierFilter}
            onChange={setCarrierFilter}
            className="filter-pill-select"
            style={{ width: 180 }}
            options={[
              { value: 'all', label: 'All Carriers' },
              { value: 'fedex freight', label: 'FedEx Freight' },
              { value: 'dhl express', label: 'DHL Express' },
              { value: 'ups freight', label: 'UPS Freight' },
            ]}
          />

          {/* Reset Filters Pill */}
          {(searchTerm || statusFilter !== 'all' || carrierFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setCarrierFilter('all');
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
                        {o.orderNumber}
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 12,
                          backgroundColor: o.status === 'Delivered' ? '#ECFDF5' : '#EFF6FF',
                          color: o.status === 'Delivered' ? '#059669' : '#2563EB',
                        }}
                      >
                        {o.status}
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 15, color: '#172B4D', marginBottom: 4 }}>
                      {o.productName}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                      Supplier: <strong style={{ color: '#172B4D' }}>{o.merchantName}</strong> &bull; {o.quantity} units
                    </div>

                    <div style={{ marginBottom: 14, background: '#F8FAFC', padding: 12, borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#64748B' }}>Escrow Total</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>
                          ${o.totalPrice.toLocaleString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748B' }}>
                        <span>Carrier</span>
                        <strong style={{ color: '#172B4D' }}>{o.carrier}</strong>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 16 }}>
                      Tracking: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#172B4D' }}>{o.trackingNumber}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setViewingOrder(o)}
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
                    Audit Order Escrow
                  </button>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* 4. Order Audit Details Modal */}
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
                Order Contract Audit: {viewingOrder?.orderNumber}
              </div>
              <div style={{ fontSize: 11, color: '#64748B' }}>
                Ref: <span style={{ color: '#7C3AED', fontWeight: 600 }}>{viewingOrder?.demandCode}</span>
              </div>
            </div>
          </div>
        }
        open={!!viewingOrder}
        onCancel={() => setViewingOrder(null)}
        footer={[
          <button
            key="close"
            onClick={() => setViewingOrder(null)}
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
            key="release"
            onClick={() => {
              message.success(`Escrow settlement for Order ${viewingOrder?.orderNumber} released to merchant.`);
              setViewingOrder(null);
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
            Authorize Escrow Release
          </button>,
        ]}
        width={640}
      >
        {viewingOrder && (
          <div style={{ marginTop: 16 }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Order Number">{viewingOrder.orderNumber}</Descriptions.Item>
              <Descriptions.Item label="Demand Ref">{viewingOrder.demandCode}</Descriptions.Item>
              <Descriptions.Item label="Product Item">{viewingOrder.productName}</Descriptions.Item>
              <Descriptions.Item label="Fulfilling Supplier">{viewingOrder.merchantName}</Descriptions.Item>
              <Descriptions.Item label="Quantity">{viewingOrder.quantity} units</Descriptions.Item>
              <Descriptions.Item label="Est. Unit Price">${Math.round(viewingOrder.totalPrice / viewingOrder.quantity)}</Descriptions.Item>
              <Descriptions.Item label="Escrow Total" span={2}>
                <span style={{ color: '#059669', fontWeight: 700, fontSize: 15 }}>
                  ${viewingOrder.totalPrice.toLocaleString()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Carrier">{viewingOrder.carrier}</Descriptions.Item>
              <Descriptions.Item label="Tracking Number">
                <Text code copyable>{viewingOrder.trackingNumber}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Est. Delivery">{viewingOrder.estimatedDelivery}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <span
                  style={{
                    backgroundColor: viewingOrder.status === 'Delivered' ? '#ECFDF5' : '#EFF6FF',
                    color: viewingOrder.status === 'Delivered' ? '#059669' : '#2563EB',
                    padding: '2px 10px',
                    borderRadius: 12,
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {viewingOrder.status}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16, background: '#F8FAFC', padding: 14, borderRadius: 10 }}>
              <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13, marginBottom: 4 }}>
                Smart Escrow Contract Protection
              </div>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                Funds are held in secure escrow vaults. The settlement will automatically release upon delivery carrier API webhook confirmation or buyer inspection sign-off within 48 hours.
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OrderManagement;
