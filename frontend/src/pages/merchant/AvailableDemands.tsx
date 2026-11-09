import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Empty, Input, Row, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  FileAddOutlined,
  SearchOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  fetchActiveDemands,
  subscribeToDemandChanges,
  type ActiveDemand,
} from '../../services/merchantDemandService';

const { Title, Text, Paragraph } = Typography;

const statusColor = (status: string): string => {
  switch (status) {
    case 'Submitted':
    case 'Pending':
      return 'blue';
    case 'Under Review':
      return 'gold';
    case 'Grouped':
      return 'purple';
    case 'Bidding Open':
    case 'Offers Available':
      return 'cyan';
    case 'Offers Received':
      return 'green';
    case 'Approved':
      return 'geekblue';
    default:
      return 'default';
  }
};

const formatMoney = (value: number | string | null, currency: string | null): string | null => {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (currency && /^[A-Z]{3}$/i.test(currency.trim())) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency.trim().toUpperCase(),
        currencyDisplay: 'code',
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch {
      return numeric.toLocaleString();
    }
  }
  return numeric.toLocaleString();
};

const priceLabel = (demand: ActiveDemand): string => {
  const min = formatMoney(demand.min_target_unit_price, demand.currency);
  const max = formatMoney(demand.max_target_unit_price, demand.currency);
  if (min && max) return min === max ? min : `${min} – ${max}`;
  if (max) return `Up to ${max}`;
  if (min) return `From ${min}`;
  return formatMoney(demand.target_price, demand.currency) ?? 'Not specified';
};

const deliveryLabel = (demand: ActiveDemand): string => {
  if (demand.required_delivery_time) return demand.required_delivery_time;
  if (demand.expected_lead_time) return `${demand.expected_lead_time} day${demand.expected_lead_time === 1 ? '' : 's'}`;
  if (demand.deadline) return `By ${demand.deadline}`;
  return 'Not specified';
};

const quantityLabel = (demand: ActiveDemand): string => {
  if (demand.target_quantity == null || demand.target_quantity === '') return 'Not specified';
  return `${demand.target_quantity} ${demand.unit || 'units'}`;
};

const searchableText = (demand: ActiveDemand): string => {
  const requirements = demand.normalized_requirements;
  const parts: Array<string | null | undefined> = [
    demand.title,
    demand.demand_code,
    demand.category,
    demand.description,
    demand.brand,
    demand.model_number,
    demand.additional_requirements,
    demand.custom_requirements,
    requirements?.product_type,
    requirements?.normalized_product_name,
    requirements?.normalized_category,
    requirements?.normalized_material,
  ];
  (demand.technical_specifications ?? []).forEach((spec) => {
    parts.push(spec.name, spec.value, spec.unit);
  });
  (requirements?.mandatory_requirements ?? []).forEach((item) => parts.push(item.name, item.value));
  (requirements?.optional_preferences ?? []).forEach((item) => parts.push(item.name, item.value));
  Object.entries(requirements?.normalized_specifications ?? {}).forEach(([key, value]) => {
    parts.push(key, value);
  });
  return parts.filter(Boolean).join(' ').toLowerCase();
};

export const AvailableDemands: React.FC = () => {
  const navigate = useNavigate();
  const [demands, setDemands] = useState<ActiveDemand[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const rows = await fetchActiveDemands();
      setDemands(rows);
      setError(null);
    } catch {
      setError('Customer demands could not be loaded. Please retry in a moment.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void load(false), 400);
  }, [load]);

  useEffect(() => {
    void load(true);
    const unsubscribe = subscribeToDemandChanges(scheduleRefresh);
    const interval = window.setInterval(() => void load(false), 20000);
    const handleFocus = () => void load(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [load, scheduleRefresh]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    demands.forEach((demand) => {
      if (demand.category) unique.add(demand.category);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [demands]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return demands.filter((demand) => {
      const matchesCategory = categoryFilter === 'all' || demand.category === categoryFilter;
      const matchesSearch = term.length === 0 || searchableText(demand).includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [demands, searchTerm, categoryFilter]);

  const columns: ColumnsType<ActiveDemand> = [
    {
      title: 'Demand',
      key: 'demand',
      width: 300,
      render: (_, record) => (
        <div>
          <Text strong style={{ color: '#1677FF', fontSize: 12 }}>{record.demand_code}</Text>
          <div style={{ fontWeight: 600, color: '#172B4D', marginTop: 2 }}>{record.title}</div>
          <Space size={4} wrap style={{ marginTop: 4 }}>
            <Tag color="blue">{record.category || 'Uncategorised'}</Tag>
            <Tag color={statusColor(record.status)}>{record.status}</Tag>
          </Space>
          {record.description && (
            <Paragraph
              type="secondary"
              ellipsis={{ rows: 2 }}
              style={{ margin: '6px 0 0 0', fontSize: 12 }}
            >
              {record.description}
            </Paragraph>
          )}
        </div>
      ),
    },
    {
      title: 'Required Quantity',
      key: 'quantity',
      width: 140,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 700, color: '#172B4D' }}>{quantityLabel(record)}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.unit || 'units'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Target Price',
      key: 'price',
      width: 190,
      render: (_, record) => (
        <div>
          <span style={{ color: '#52C41A', fontWeight: 700 }}>{priceLabel(record)}</span>
          <div style={{ fontSize: 11, color: '#6B778C' }}>per {record.unit || 'unit'}</div>
        </div>
      ),
    },
    {
      title: 'Delivery Timeline',
      key: 'delivery',
      width: 160,
      render: (_, record) => <span>{deliveryLabel(record)}</span>,
    },
    {
      title: 'Requirements',
      key: 'requirements',
      width: 130,
      render: (_, record) => {
        const count =
          (record.technical_specifications?.length ?? 0) +
          (record.normalized_requirements?.mandatory_requirements?.length ?? 0);
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{count} spec{count === 1 ? '' : 's'}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {(record.normalized_requirements?.optional_preferences?.length ?? 0)} preferences
            </Text>
          </div>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 210,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/merchant/demands/${record.id}`)}
          >
            View Details
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<FileAddOutlined />}
            onClick={() => navigate(`/merchant/offers/submit?demand=${record.id}`)}
          >
            Submit Offer
          </Button>
        </Space>
      ),
    },
  ];

  const renderEmpty = () => {
    if (loading) return <div style={{ padding: 40 }} />;
    if (error) {
      return (
        <div style={{ padding: 24 }}>
          <Alert type="error" title={error} showIcon />
        </div>
      );
    }
    if (demands.length === 0) {
      return (
        <Empty
          description="No active customer demands right now. New demands appear here automatically."
          style={{ padding: 40 }}
        />
      );
    }
    return (
      <Empty
        description="No demands match your search or category filter."
        style={{ padding: 40 }}
      />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: '20px 24px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Title level={4} style={{ margin: 0, color: '#172B4D' }}>
              Available Customer Demands
            </Title>
            <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13 }}>
              Live requests submitted by customers. Review the full requirement set and submit a
              competitive offer with your pricing, lead time, warranty, and delivery terms.
            </Paragraph>
          </div>
          <Tag color="green" icon={<ThunderboltOutlined />}>Live sync</Tag>
        </div>
      </Card>

      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 16 } }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Search product, description, specifications, demand code..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              prefix={<SearchOutlined style={{ color: '#8993A4' }} />}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={7}>
            <Select
              style={{ width: '100%' }}
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { label: 'All Categories', value: 'all' },
                ...categories.map((category) => ({ label: category, value: category })),
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={9} style={{ textAlign: 'right' }}>
            <Space size={12}>
              {refreshing && <SyncOutlined spin style={{ color: '#1677FF' }} />}
              <Text type="secondary" style={{ fontSize: 13 }}>
                Available Demands: <strong>{filtered.length}</strong>
                {filtered.length !== demands.length ? ` of ${demands.length}` : ''}
              </Text>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={filtered.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
          scroll={{ x: 1050 }}
          locale={{ emptyText: renderEmpty() }}
        />
      </Card>
    </div>
  );
};

export default AvailableDemands;
