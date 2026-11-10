import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  List,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileAddOutlined,
  InboxOutlined,
  TagOutlined,
} from '@ant-design/icons';
import {
  fetchActiveDemand,
  type ActiveDemand,
  type DemandSpecification,
  type NormalizedRequirement,
} from '../../services/merchantDemandService';

const { Title, Text, Paragraph } = Typography;

const humanize = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

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

const specifications = (demand: ActiveDemand): DemandSpecification[] => {
  if (demand.technical_specifications && demand.technical_specifications.length > 0) {
    return demand.technical_specifications;
  }
  const normalized = demand.normalized_requirements?.normalized_specifications ?? {};
  return Object.entries(normalized).map(([name, value]) => ({
    name,
    value: String(value),
    mandatory: false,
  }));
};

const requirementItems = (items: NormalizedRequirement[] | null | undefined): NormalizedRequirement[] =>
  (items ?? []).filter((item) => item && item.value != null && String(item.value).trim() !== '');

export const DemandDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [demand, setDemand] = useState<ActiveDemand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const row = await fetchActiveDemand(id);
        if (active) {
          setDemand(row);
          setError(null);
        }
      } catch {
        if (active) setError('This demand could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6B778C' }}>Loading demand...</div>;
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/merchant/demands')}>
          Back to Available Demands
        </Button>
        <Alert type="error" title={error} showIcon />
      </div>
    );
  }

  if (!demand) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/merchant/demands')}>
          Back to Available Demands
        </Button>
        <Card>
          <Empty description="This demand is no longer available. It may have been accepted, cancelled, expired, or completed." />
        </Card>
      </div>
    );
  }

  const specs = specifications(demand);
  const mandatory = requirementItems(demand.normalized_requirements?.mandatory_requirements);
  const optional = requirementItems(demand.normalized_requirements?.optional_preferences);
  const dimensions = demand.dimensions ?? {};
  const address = demand.delivery_address ?? {};
  const hasAddress = Object.values(address).some((value) => value != null && String(value).trim() !== '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/merchant/demands')}>
          Back to Available Demands
        </Button>
      </div>

      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 28 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ maxWidth: 720 }}>
            <Space style={{ marginBottom: 8 }} wrap>
              <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px' }}>{demand.demand_code}</Tag>
              <Tag color="cyan">{demand.category || 'Uncategorised'}</Tag>
              <Tag color="green">{demand.status}</Tag>
            </Space>
            <Title level={3} style={{ margin: 0, color: '#172B4D' }}>{demand.title}</Title>
            {demand.brand || demand.model_number ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {[demand.brand, demand.model_number].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </div>
          <Button
            type="primary"
            size="large"
            icon={<FileAddOutlined />}
            onClick={() => navigate(`/merchant/offers/submit?demand=${demand.id}`)}
          >
            Submit Offer for this Demand
          </Button>
        </div>

        {demand.description && (
          <>
            <Divider style={{ margin: '20px 0 16px' }} />
            <Title level={5} style={{ marginBottom: 8 }}>Requirement Description</Title>
            <Paragraph style={{ margin: 0, color: '#42526E', whiteSpace: 'pre-line' }}>
              {demand.description}
            </Paragraph>
          </>
        )}

        <Divider style={{ margin: '20px 0' }} />
        <div style={{ background: '#F5F7FA', padding: 20, borderRadius: 8 }}>
          <Row gutter={[24, 16]}>
            <Col xs={24} sm={8}>
              <Space size={6}>
                <InboxOutlined style={{ color: '#1677FF' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Required Quantity</Text>
              </Space>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#172B4D' }}>
                {demand.target_quantity ?? '—'} <span style={{ fontSize: 14 }}>{demand.unit || 'units'}</span>
              </div>
            </Col>
            <Col xs={24} sm={8} style={{ borderLeft: '1px solid #DFE1E6' }}>
              <Space size={6}>
                <DollarOutlined style={{ color: '#52C41A' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Target Unit Price</Text>
              </Space>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>{priceLabel(demand)}</div>
              <div style={{ fontSize: 11, color: '#6B778C' }}>per {demand.unit || 'unit'}</div>
            </Col>
            <Col xs={24} sm={8} style={{ borderLeft: '1px solid #DFE1E6' }}>
              <Space size={6}>
                <ClockCircleOutlined style={{ color: '#1677FF' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>Delivery Timeline</Text>
              </Space>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#172B4D' }}>{deliveryLabel(demand)}</div>
              <div style={{ fontSize: 11, color: '#6B778C' }}>
                Created {new Date(demand.created_at).toLocaleDateString()}
              </div>
            </Col>
          </Row>
        </div>
      </Card>

      <Card
        title={<Space><TagOutlined />Technical Specifications</Space>}
        style={{ background: '#FFFFFF', borderColor: '#EBECF0' }}
        styles={{ body: { padding: specs.length ? 0 : 24 } }}
      >
        {specs.length === 0 ? (
          <Empty description="No technical specifications supplied." />
        ) : (
          <Descriptions bordered column={2} size="middle" style={{ marginTop: -1 }}>
            {specs.map((spec, index) => (
              <Descriptions.Item
                key={`${spec.name}-${index}`}
                label={
                  <Space size={4}>
                    {humanize(spec.name)}
                    {spec.mandatory ? <Tag color="red">Mandatory</Tag> : null}
                  </Space>
                }
              >
                {spec.value}{spec.unit ? ` ${spec.unit}` : ''}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Card>

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <Card title="Mandatory Customer Requirements" style={{ background: '#FFFFFF', borderColor: '#EBECF0', height: '100%' }}>
            {mandatory.length === 0 ? (
              <Text type="secondary">No separate mandatory requirements were extracted.</Text>
            ) : (
              <List
                size="small"
                dataSource={mandatory}
                renderItem={(item) => (
                  <List.Item>
                    <Text strong style={{ marginRight: 8 }}>{humanize(item.name)}:</Text>
                    <Text>{item.value}</Text>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Optional Preferences" style={{ background: '#FFFFFF', borderColor: '#EBECF0', height: '100%' }}>
            {optional.length === 0 ? (
              <Text type="secondary">No optional preferences were extracted.</Text>
            ) : (
              <List
                size="small"
                dataSource={optional}
                renderItem={(item) => (
                  <List.Item>
                    <Text strong style={{ marginRight: 8 }}>{humanize(item.name)}:</Text>
                    <Text>{item.value}</Text>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Delivery & Commercial Details" style={{ background: '#FFFFFF', borderColor: '#EBECF0' }}>
        <Descriptions bordered column={1} size="middle">
          <Descriptions.Item label="Expected Lead Time">
            {demand.expected_lead_time ? `${demand.expected_lead_time} days` : 'Not specified'}
          </Descriptions.Item>
          <Descriptions.Item label="Required Delivery Time">
            {demand.required_delivery_time || 'Not specified'}
          </Descriptions.Item>
          <Descriptions.Item label="Currency">{demand.currency || 'Not specified'}</Descriptions.Item>
          <Descriptions.Item label="Delivery Address">
            {hasAddress
              ? [address.address, address.city, address.state, address.postal_code]
                  .filter((value) => value != null && String(value).trim() !== '')
                  .join(', ')
              : 'Not specified'}
          </Descriptions.Item>
          <Descriptions.Item label="Delivery Instructions">
            {address.instructions || 'None'}
          </Descriptions.Item>
          <Descriptions.Item label="Additional Requirements">
            {demand.additional_requirements || 'None'}
          </Descriptions.Item>
          <Descriptions.Item label="Custom Requirements">
            {demand.custom_requirements || 'None'}
          </Descriptions.Item>
          {Object.keys(dimensions).length > 0 && (
            <Descriptions.Item label="Dimensions">
              {Object.entries(dimensions)
                .map(([key, value]) => `${humanize(key)}: ${value}`)
                .join(', ')}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    </div>
  );
};

export default DemandDetails;
