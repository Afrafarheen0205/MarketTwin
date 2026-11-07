import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreAddOutlined,
  EyeOutlined,
  SearchOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import demandApi, { DemandRecord } from '../../api/demandApi';
import axiosClient from '../../api/axiosClient';

const { Title, Text } = Typography;

const formatMoney = (
  amount: number | null | undefined,
  currency?: string | null
): string => {
  if (amount === null || amount === undefined) return 'Not specified';
  if (!currency) return String(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
};

export const MyDemands: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [demands, setDemands] = useState<DemandRecord[]>([]);
  const [totalDemands, setTotalDemands] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewingDemand, setViewingDemand] = useState<DemandRecord | null>(null);
  const [reqStatus, setReqStatus] = useState<{
    status?: string;
    clarification_questions?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) {
        setDemands([]);
        setTotalDemands(0);
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const response = await demandApi.listDemands({
          page,
          page_size: pageSize,
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: searchTerm.trim() || undefined,
        });
        if (active) {
          setDemands(response.items);
          setTotalDemands(response.total);
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : 'Unable to load your demands.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [user, page, pageSize, searchTerm, statusFilter]);

  useEffect(() => {
    let active = true;
    const loadRequirementStatus = async () => {
      if (!viewingDemand) {
        setReqStatus(null);
        return;
      }
      try {
        const response = await axiosClient.get(
          `/api/v1/customer/demands/${viewingDemand.id}/requirement-status`
        );
        if (active) setReqStatus(response.data);
      } catch {
        if (active) setReqStatus(null);
      }
    };
    void loadRequirementStatus();
    return () => {
      active = false;
    };
  }, [viewingDemand]);

  const columns: ColumnsType<DemandRecord> = [
    {
      title: 'Demand Code',
      key: 'demand_code',
      render: (_, record) =>
        record.demand_code || <Text type="secondary">Not provided by API</Text>,
    },
    {
      title: 'Product & Category',
      dataIndex: 'product_name',
      key: 'product_name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          {record.category && <Tag color="blue">{record.category}</Tag>}
        </div>
      ),
    },
    {
      title: 'Target unit price range',
      key: 'target_price_range',
      render: (_, record) =>
        record.minimum_target_unit_price !== null && record.minimum_target_unit_price !== undefined
          && record.maximum_target_unit_price !== null && record.maximum_target_unit_price !== undefined
          ? `${formatMoney(record.minimum_target_unit_price, record.currency)}–${formatMoney(record.maximum_target_unit_price, record.currency)} / ${record.unit || 'unit'}`
          : 'Not specified',
    },
    {
      title: 'Quantity',
      key: 'quantity',
      render: (_, record) => `${record.quantity} ${record.unit || ''}`.trim(),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color =
          status === 'Approved'
            ? 'green'
            : status === 'Offers Received'
              ? 'gold'
              : status === 'Grouped'
                ? 'blue'
                : 'default';
        return <Tag color={color}>{status || 'Not provided'}</Tag>;
      },
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value?: string | null) =>
        value ? new Date(value).toLocaleDateString() : 'Not provided',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewingDemand(record)}
          >
            Specs
          </Button>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<TagsOutlined />}
            onClick={() => navigate('/customer/offers')}
          >
            Offers
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card styles={{ body: { padding: '20px 24px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={16}>
            <Title level={4} style={{ margin: 0 }}>My Product Demands</Title>
            <Text type="secondary">
              Track submitted demands and review merchant offers.
            </Text>
          </Col>
          <Col xs={24} sm={8} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              icon={<AppstoreAddOutlined />}
              onClick={() => navigate('/customer/demands/create')}
            >
              Create New Demand
            </Button>
          </Col>
        </Row>
      </Card>
      {loadError && <Alert type="error" showIcon message={loadError} />}
      <Card styles={{ body: { padding: 16 } }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12}>
            <Input
              placeholder="Search demands by product..."
              value={searchTerm}
              onChange={(event) => {
                setPage(1);
                setSearchTerm(event.target.value);
              }}
              prefix={<SearchOutlined />}
              allowClear
            />
          </Col>
          <Col xs={24} sm={6}>
            <Select
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={(value) => {
                setPage(1);
                setStatusFilter(value);
              }}
              options={[
                { label: 'All Statuses', value: 'all' },
                ...Array.from(new Set(demands.map((demand) => demand.status)))
                  .filter(Boolean)
                  .map((status) => ({ label: status, value: status })),
              ]}
            />
          </Col>
          <Col xs={24} sm={6} style={{ textAlign: 'right' }}>
            <Text>
              {searchTerm || statusFilter !== 'all' ? 'Matching demands: ' : 'Total demands: '}
              <strong>{totalDemands}</strong>
            </Text>
          </Col>
        </Row>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        {demands.length === 0 && !loading ? (
          <Empty description="No demands found" style={{ padding: 40 }} />
        ) : (
          <Table
            columns={columns}
            dataSource={demands}
            rowKey="id"
            pagination={{
              current: page,
              pageSize,
              total: totalDemands,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPageSize === pageSize ? nextPage : 1);
                setPageSize(nextPageSize);
              },
            }}
            loading={loading}
          />
        )}
      </Card>
      <Modal
        title="Demand details"
        open={Boolean(viewingDemand)}
        onCancel={() => setViewingDemand(null)}
        footer={[
          <Button key="close" onClick={() => setViewingDemand(null)}>Close</Button>,
          <Button
            key="offers"
            type="primary"
            onClick={() => {
              setViewingDemand(null);
              navigate('/customer/offers');
            }}
          >
            View Received Offers
          </Button>,
        ]}
        width={680}
      >
        {viewingDemand && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="Product" span={2}>
              {viewingDemand.product_name}
            </Descriptions.Item>
            <Descriptions.Item label="Category">
              {viewingDemand.category || 'Not specified'}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Badge status="processing" text={viewingDemand.status || 'Not provided'} />
            </Descriptions.Item>
            <Descriptions.Item label="Quantity">
              {viewingDemand.quantity} {viewingDemand.unit}
            </Descriptions.Item>
            <Descriptions.Item label="Target unit price range" span={2}>
              {formatMoney(viewingDemand.minimum_target_unit_price, viewingDemand.currency)}
              {' – '}
              {formatMoney(viewingDemand.maximum_target_unit_price, viewingDemand.currency)}
            </Descriptions.Item>
            <Descriptions.Item label="Created">
              {viewingDemand.created_at
                ? new Date(viewingDemand.created_at).toLocaleString()
                : 'Not provided'}
            </Descriptions.Item>
            <Descriptions.Item label="Delivery date">
              {viewingDemand.required_delivery_date || 'Not specified'}
            </Descriptions.Item>
            <Descriptions.Item label="Description" span={2}>
              {viewingDemand.description || 'Not provided'}
            </Descriptions.Item>
            <Descriptions.Item label="Technical specifications" span={2}>
              {viewingDemand.technical_specifications?.length
                ? viewingDemand.technical_specifications
                    .map(
                      (specification) =>
                        `${specification.name}: ${specification.value}${
                          specification.unit ? ` ${specification.unit}` : ''
                        } (${specification.mandatory ? 'mandatory' : 'optional'})`
                    )
                    .join('; ')
                : 'Not provided'}
            </Descriptions.Item>
            <Descriptions.Item label="Requirement status" span={2}>
              {reqStatus?.status || 'Pending'}
            </Descriptions.Item>
            {reqStatus?.clarification_questions?.length ? (
              <Descriptions.Item label="Clarifications" span={2}>
                {reqStatus.clarification_questions.join('; ')}
              </Descriptions.Item>
            ) : null}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default MyDemands;
