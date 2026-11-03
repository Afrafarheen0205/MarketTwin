import React, { useState } from 'react';
import {
  Row,
  Col,
  Typography,
  Table,
  Select,
  Space,
  Dropdown,
  Progress,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  SyncOutlined,
  QuestionCircleOutlined,
  DownOutlined,
  ArrowUpOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  BarChartOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

interface CategoryReportItem {
  id: string;
  category: string;
  demandVolume: string;
  activePools: number;
  averageSavings: string;
  bidsPerPool: number;
  attainmentRate: number;
}

const reportData: CategoryReportItem[] = [
  {
    id: '1',
    category: 'Office Furniture & Ergonomics',
    demandVolume: '$142,000',
    activePools: 14,
    averageSavings: '31.2%',
    bidsPerPool: 4.2,
    attainmentRate: 92,
  },
  {
    id: '2',
    category: 'Renewable Energy & Solar',
    demandVolume: '$118,000',
    activePools: 10,
    averageSavings: '28.5%',
    bidsPerPool: 3.6,
    attainmentRate: 88,
  },
  {
    id: '3',
    category: 'Commercial Kitchen & Appliances',
    demandVolume: '$86,000',
    activePools: 8,
    averageSavings: '24.8%',
    bidsPerPool: 3.9,
    attainmentRate: 95,
  },
  {
    id: '4',
    category: 'Food & Beverage Bulk Supplies',
    demandVolume: '$68,000',
    activePools: 6,
    averageSavings: '22.0%',
    bidsPerPool: 3.1,
    attainmentRate: 85,
  },
];

export const ReportsAnalytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState('This Month');
  const [syncing, setSyncing] = useState(false);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      message.success('Marketplace analytics & financial metrics refreshed.');
    }, 600);
  };

  const columns: ColumnsType<CategoryReportItem> = [
    {
      title: 'Category Sector',
      dataIndex: 'category',
      key: 'category',
      render: (cat) => (
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
            <div style={{ fontWeight: 600, color: '#172B4D', fontSize: 13.5 }}>{cat}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>Commercial Demand Stream</div>
          </div>
        </Space>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Aggregated Volume</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'demandVolume',
      key: 'demandVolume',
      render: (v) => <span style={{ fontWeight: 700, color: '#172B4D', fontSize: 13.5 }}>{v}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Active Pools</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'activePools',
      key: 'activePools',
      render: (p) => <span style={{ fontWeight: 600, color: '#172B4D' }}>{p} pools</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Average Savings</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'averageSavings',
      key: 'averageSavings',
      render: (s) => <span style={{ fontWeight: 700, color: '#059669', fontSize: 13.5 }}>{s}</span>,
    },
    {
      title: (
        <Space size={4}>
          <span>Threshold Attainment</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      key: 'attainment',
      render: (_, r) => (
        <div style={{ width: 130 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
            <span style={{ color: '#64748B' }}>Pool Rate</span>
            <span style={{ fontWeight: 700, color: '#059669' }}>{r.attainmentRate}%</span>
          </div>
          <Progress percent={r.attainmentRate} size="small" strokeColor="#10B981" trailColor="#F1F5F9" showInfo={false} />
        </div>
      ),
    },
    {
      title: (
        <Space size={4}>
          <span>Merchant Bids / Pool</span>
          <span style={{ fontSize: 11, color: '#8993A4' }}>⇅</span>
        </Space>
      ),
      dataIndex: 'bidsPerPool',
      key: 'bidsPerPool',
      render: (b) => (
        <span
          style={{
            backgroundColor: '#EFF6FF',
            color: '#2563EB',
            borderRadius: 16,
            padding: '2px 10px',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {b} bids
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 24 }}>
      {/* 1. Header (Overview + Sync / Help / Time Filter) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#172B4D', letterSpacing: -0.5 }}>
            Marketplace Reports & Demand Analytics
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Performance metrics on customer demand grouping efficiency, merchant bidding competitiveness, and wholesale savings unlocked
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
            onClick={() => message.info('Analytics aggregate real-time transaction, pooling threshold, and discount data.')}
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Demand Grouping Success</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>87.5%</span>
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Average Customer Savings</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>28.4%</span>
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
                vs Catalog
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Bids Per Demand Pool</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>3.8</span>
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
                High Competition
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
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>Customer Approval Rate</span>
              <EyeOutlined style={{ color: '#94A3B8', fontSize: 14, cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>94.2%</span>
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
                Zero Disputes
              </span>
            </div>
          </div>
        </Col>
      </Row>

      {/* 3. Category Volume Breakdown & Operational Efficiency */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              border: '1px solid #E2E8F0',
              padding: '20px 24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              height: '100%',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                Category Demand Volume Breakdown
              </span>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Total: $414,000</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#172B4D' }}>Office Furniture & Ergonomics</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#172B4D' }}>$142,000 (34%)</span>
                </div>
                <Progress percent={34} strokeColor="#7C3AED" trailColor="#F1F5F9" showInfo={false} />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#172B4D' }}>Renewable Energy & Solar</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#172B4D' }}>$118,000 (28%)</span>
                </div>
                <Progress percent={28} strokeColor="#10B981" trailColor="#F1F5F9" showInfo={false} />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#172B4D' }}>Commercial Kitchen & Appliances</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#172B4D' }}>$86,000 (21%)</span>
                </div>
                <Progress percent={21} strokeColor="#F59E0B" trailColor="#F1F5F9" showInfo={false} />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#172B4D' }}>Food & Beverage Bulk Supplies</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#172B4D' }}>$68,000 (17%)</span>
                </div>
                <Progress percent={17} strokeColor="#3B82F6" trailColor="#F1F5F9" showInfo={false} />
              </div>
            </div>
          </div>
        </Col>

        <Col xs={24} lg={12}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              border: '1px solid #E2E8F0',
              padding: '20px 24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              height: '100%',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                Marketplace Efficiency Insights
              </span>
              <button
                onClick={() => message.success('Full analytical report generated.')}
                style={{
                  backgroundColor: '#0A101D',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 16,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Export Insights
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                <strong style={{ color: '#172B4D', fontSize: 13 }}>Clustering Algorithm Precision</strong>
                <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 12 }}>
                  Demand items grouped with &gt;80% specification similarity unlocked an additional 12.4% merchant price concession.
                </Paragraph>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                <strong style={{ color: '#172B4D', fontSize: 13 }}>Explicit Approval Friction Index</strong>
                <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 12 }}>
                  Customer approval gating generated zero buyer returns or dispute claims across all fulfilled bulk contracts.
                </Paragraph>
              </div>

              <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                <strong style={{ color: '#172B4D', fontSize: 13 }}>Fulfillment On-Time Metric</strong>
                <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 12 }}>
                  Certified merchants delivered 98.4% of orders strictly within the promised lead-time window.
                </Paragraph>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {/* 4. Category Performance Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
            Category Financial Performance
          </span>
          <button
            onClick={() => message.success('Financial analytics matrix exported.')}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#334155',
              border: '1px solid #CBD5E1',
              borderRadius: 20,
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Download CSV
          </button>
        </div>

        <div className="market-offers-table">
          <Table
            columns={columns}
            dataSource={reportData}
            rowKey="id"
            pagination={false}
          />
        </div>
      </div>
    </div>
  );
};

export default ReportsAnalytics;
