import React from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Row,
  Col,
  Typography,
  Avatar,
  Tag,
  Descriptions,
  Rate,
  message,
} from 'antd';
import {
  ShopOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  SaveOutlined,
  DollarOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const MerchantProfile: React.FC = () => {
  const [form] = Form.useForm();

  const handleSave = () => {
    message.success('Merchant profile details updated.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 24 } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar size={72} style={{ backgroundColor: '#FAAD14', fontSize: 24 }} icon={<ShopOutlined />} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Title level={4} style={{ margin: 0, color: '#172B4D' }}>Apex Workspace Solutions</Title>
              <Tag color="green" icon={<CheckCircleOutlined />}>Verified Merchant Tier 1</Tag>
              <Tag color="blue">ISO 9001 Certified</Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Rate disabled defaultValue={4.9} style={{ fontSize: 13, color: '#FAAD14' }} />
              <span style={{ fontSize: 12, color: '#6B778C' }}>4.9 Rating (34 fulfilled contracts)</span>
            </div>
          </div>
        </div>
      </Card>

      <Row gutter={[20, 20]}>
        <Col xs={24} md={14}>
          <Card
            title="Merchant Business Profile"
            style={{ background: '#FFFFFF', borderColor: '#EBECF0' }}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={{
                companyName: 'Apex Workspace Solutions Inc.',
                contactPerson: 'Marcus Vance',
                email: 'partners@apexworkspace.com',
                phone: '+1 (800) 492-8192',
                facilityAddress: '102 Industrial Parkway, Grand Rapids, MI',
                taxId: 'US-EIN-8840291',
                categories: 'Office Furniture, Ergonomic Hardware',
              }}
            >
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="companyName" label="Registered Legal Business Name">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="contactPerson" label="Principal Account Officer">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="email" label="Merchant Business Email">
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="phone" label="Operations Telephone">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="facilityAddress" label="Manufacturing & Logistics Center">
                <Input />
              </Form.Item>

              <Form.Item name="categories" label="Accredited Supply Categories">
                <Input disabled />
              </Form.Item>

              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                Save Merchant Profile
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={10}>
          <Card
            title="Merchant Performance Summary"
            style={{ background: '#FFFFFF', borderColor: '#EBECF0' }}
          >
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Accreditation Status">
                <Tag color="green">Accredited</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Total Contract Payouts">
                <span style={{ fontWeight: 700, color: '#52C41A' }}>$84,200 USD</span>
              </Descriptions.Item>
              <Descriptions.Item label="Fulfillment On-Time Rate">
                <strong>98.4%</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Escrow Settlement Speed">
                <strong>48 Hours post-customer inspection</strong>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MerchantProfile;
