import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, Typography, Modal, Descriptions, Steps, Divider, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CarOutlined,
  EyeOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import { fetchOrders, subscribeToOrders } from '../../services/orderService';

const { Title, Text, Paragraph } = Typography;

const formatOrderPrice = (value: string | number, currency: string): string => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not specified';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

export const Orders: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchOrders({ customerId: user.id });
      setOrders(data);
    } catch (err) {
      console.error('Error fetching customer orders:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load and Real-time subscription to orders table
  useEffect(() => {
    loadOrders();
    const unsubscribe = subscribeToOrders(() => {
      loadOrders();
    });
    return () => {
      unsubscribe();
    };
  }, [loadOrders]);

  const handleOpenDetails = (record: any) => {
    setSelectedOrder(record);
    setDetailsModalOpen(true);
  };

  const getStepIndex = (status: string, currentStep?: number) => {
    if (currentStep !== undefined && currentStep !== null) return currentStep;
    const s = (status || '').toLowerCase();
    if (s === 'delivered') return 3;
    if (s === 'dispatched' || s === 'in transit') return 2;
    if (s === 'processing' || s === 'in production') return 1;
    return 0;
  };

  const columns: ColumnsType<any> = [
    {
      title: 'Order Number',
      dataIndex: 'order_number',
      key: 'order_number',
      render: (num, record) => (
        <div>
          <Text strong style={{ color: '#1677FF', cursor: 'pointer' }} onClick={() => handleOpenDetails(record)}>
            {num}
          </Text>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>{record.order_date || 'Today'}</div>
        </div>
      ),
    },
    {
      title: 'Product Title',
      dataIndex: 'product_name',
      key: 'product_name',
      render: (name, record) => (
        <div>
          <span style={{ fontWeight: 600, color: '#172B4D' }}>{name}</span>
          {record.product_id && <div style={{ fontSize: 11, color: '#64748B' }}>ID: {record.product_id}</div>}
          {record.match_classification === 'CLOSEST_ALTERNATIVE' && <Tag color="gold">Closest alternative</Tag>}
        </div>
      ),
    },
    {
      title: 'Fulfillment Merchant',
      dataIndex: 'merchant_name',
      key: 'merchant_name',
      render: (name) => <span style={{ color: '#475569' }}>{name || 'Not provided'}</span>,
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (q) => `${q} units`,
    },
    {
      title: 'Total Price',
      dataIndex: 'total_price',
      key: 'total_price',
      render: (p, record) => (
        <span style={{ fontWeight: 700, color: '#059669', fontSize: 13.5 }}>
          {formatOrderPrice(p, record.currency || record.accepted_terms?.currency || 'USD')}
        </span>
      ),
    },
    {
      title: 'Fulfillment Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color = 'default';
        if (status === 'Approved') color = 'blue';
        if (status === 'Processing' || status === 'In Production') color = 'gold';
        if (status === 'Dispatched') color = 'cyan';
        if (status === 'Delivered') color = 'green';
        if (status === 'Cancelled') color = 'red';
        return (
          <Tag color={color} style={{ borderRadius: 10, fontWeight: 600 }}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size={8}>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<EyeOutlined />}
            onClick={() => handleOpenDetails(record)}
            style={{ borderRadius: 6 }}
          >
            View Details
          </Button>
          <Button
            size="small"
            icon={<CarOutlined />}
            onClick={() => navigate(`/customer/orders/${record.id}/track`)}
            style={{ borderRadius: 6 }}
          >
            Track
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Card */}
      <Card
        style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingOutlined style={{ color: '#1677FF', fontSize: 20 }} />
              <Title level={4} style={{ margin: 0, color: '#172B4D', fontWeight: 700 }}>
                My Commercial Orders
              </Title>
              <Tag color="blue" style={{ borderRadius: 10, fontWeight: 600 }}>
                Real-Time Sync Active
              </Tag>
            </div>
            <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748B' }}>
              Track real-time purchase fulfillment, supplier dispatch progress, and escrow milestone status across your orders.
            </Paragraph>
          </div>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={loadOrders}
            style={{ borderRadius: 6, fontWeight: 500 }}
          >
            Refresh Orders
          </Button>
        </div>
      </Card>

      {/* Orders Table */}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', borderRadius: 10 }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          pagination={{ pageSize: 8 }}
          loading={loading}
          locale={{ emptyText: 'No commercial orders placed yet. Browse our catalog to place your first order!' }}
        />
      </Card>

      {/* Order Details & Progress Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingOutlined style={{ color: '#1677FF' }} />
            <span style={{ fontWeight: 700 }}>Order Fulfillment Summary: {selectedOrder?.order_number}</span>
          </div>
        }
        open={detailsModalOpen}
        onCancel={() => setDetailsModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDetailsModalOpen(false)} style={{ background: '#1677FF' }}>
            Close
          </Button>,
        ]}
        width={640}
      >
        {selectedOrder && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 10 }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Order Number">{selectedOrder.order_number}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={selectedOrder.status === 'Delivered' ? 'green' : 'blue'}>
                  {selectedOrder.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Product Name" span={2}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {selectedOrder.product_snapshot?.images?.[0] && (
                    <img
                      src={selectedOrder.product_snapshot.images[0]}
                      alt={selectedOrder.product_name}
                      style={{ width: 64, height: 64, objectFit: 'contain' }}
                    />
                  )}
                  <strong>{selectedOrder.product_name}</strong>
                </div>
              </Descriptions.Item>
              {selectedOrder.product_id && (
                <Descriptions.Item label="Product ID">{selectedOrder.product_id}</Descriptions.Item>
              )}
              {selectedOrder.match_classification && (
                <Descriptions.Item label="Match">
                  {selectedOrder.match_classification === 'CLOSEST_ALTERNATIVE' ? 'Closest alternative' : 'Exact match'}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Quantity">{selectedOrder.quantity} units</Descriptions.Item>
              <Descriptions.Item label="Total Escrow Price">
                <strong style={{ color: '#059669' }}>
                  {formatOrderPrice(
                    selectedOrder.total_price,
                    selectedOrder.currency || selectedOrder.accepted_terms?.currency || 'USD',
                  )}
                </strong>
              </Descriptions.Item>
              {Object.keys(selectedOrder.product_snapshot?.specifications || {}).length > 0 && (
                <Descriptions.Item label="Specifications" span={2}>
                  {Object.entries(selectedOrder.product_snapshot.specifications)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(' · ')}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Merchant / Supplier">
                {selectedOrder.merchant_name || 'Not provided'}
              </Descriptions.Item>
              <Descriptions.Item label="Order Date">{selectedOrder.order_date || 'Recent'}</Descriptions.Item>
              <Descriptions.Item label="Logistics Carrier">
                {selectedOrder.carrier || 'Pending Logistics Assignment'}
              </Descriptions.Item>
              <Descriptions.Item label="Tracking Number">
                {selectedOrder.tracking_number || 'Awaiting Dispatch'}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '12px 0 8px 0' }} />

            <div>
              <div style={{ fontWeight: 600, color: '#172B4D', marginBottom: 12 }}>
                Fulfillment Milestone Progression:
              </div>
              <Steps
                size="small"
                current={getStepIndex(selectedOrder.status, selectedOrder.current_step)}
                items={[
                  { title: 'Order Placed', description: 'Confirmed' },
                  { title: 'Processing', description: 'In Production' },
                  { title: 'Dispatched', description: selectedOrder.carrier || 'In Transit' },
                  { title: 'Delivered', description: 'Inspection Complete' },
                ]}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#059669', background: '#F0FDF4', padding: '10px 14px', borderRadius: 6, border: '1px solid #DCFCE7' }}>
              <SafetyCertificateOutlined style={{ fontSize: 16 }} />
              <span>Full MarketTwin escrow protection is active for this order until delivery sign-off.</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Orders;
