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
  Switch,
  Divider,
  Descriptions,
  message,
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  HomeOutlined,
  CheckCircleOutlined,
  SaveOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export const CustomerProfile: React.FC = () => {
  const [form] = Form.useForm();

  const handleSave = () => {
    message.success('Profile preferences updated successfully.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} bodyStyle={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar size={72} style={{ backgroundColor: '#1677FF', fontSize: 24 }}>
            AM
          </Avatar>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Title level={4} style={{ margin: 0, color: '#172B4D' }}>Alex Mercer</Title>
              <Tag color="green" icon={<CheckCircleOutlined />}>Verified Customer</Tag>
              <Tag color="blue">Buyer Account</Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              alex.mercer@techstart.io &bull; Member since April 2026
            </Text>
          </div>
        </div>
      </Card>

      <Row gutter={[20, 20]}>
        <Col xs={24} md={14}>
          <Card
            title="Customer Profile Details"
            style={{ background: '#FFFFFF', borderColor: '#EBECF0' }}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={{
                fullName: 'Alex Mercer',
                email: 'alex.mercer@techstart.io',
                company: 'TechStart Studios Ltd.',
                taxId: 'US-EIN-9482019',
                address: '742 Evergreen Terrace, Suite 300, San Francisco, CA',
                phone: '+1 (415) 892-0192',
              }}
            >
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="fullName" label="Full Legal Name">
                    <Input prefix={<UserOutlined />} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="email" label="Contact Email">
                    <Input prefix={<MailOutlined />} disabled />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="company" label="Business / Company Name">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="taxId" label="Tax / Business ID">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="address" label="Default Freight Delivery Address">
                <Input prefix={<HomeOutlined />} />
              </Form.Item>

              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                Save Profile Changes
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={10}>
          <Card
            title="Marketplace Notification Settings"
            style={{ background: '#FFFFFF', borderColor: '#EBECF0' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>New Merchant Offers</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Receive alert when merchants bid on your demands</Text>
                </div>
                <Switch defaultChecked />
              </div>

              <Divider style={{ margin: '8px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Demand Group Threshold Alerts</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Alert when your group reaches volume discount status</Text>
                </div>
                <Switch defaultChecked />
              </div>

              <Divider style={{ margin: '8px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Order Logistics Updates</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Notifications for dispatch and delivery milestones</Text>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CustomerProfile;
