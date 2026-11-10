import React, { useEffect, useState } from 'react';
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
  message,
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  HomeOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useAuth, profileInitials } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

export const CustomerProfile: React.FC = () => {
  const [form] = Form.useForm();
  const { user, profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    form.setFieldsValue({
      fullName: profile?.fullName ?? '',
      email: profile?.email ?? '',
      company: profile?.company ?? '',
      taxId: profile?.customer?.taxId ?? '',
      address: profile?.customer?.address ?? '',
      phone: profile?.customer?.phone ?? '',
    });
  }, [form, profile]);

  const handleSave = async (values: {
    fullName: string;
    company?: string;
    taxId?: string;
    address?: string;
    phone?: string;
  }) => {
    if (!supabase || !user || !profile) {
      message.error('Your account profile is not available. Please sign in again.');
      return;
    }

    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: values.fullName.trim() || null,
          company: values.company?.trim() || null,
        })
        .eq('id', user.id);
      if (profileError) throw profileError;

      const { error: customerError } = await supabase
        .from('customer_profiles')
        .upsert(
          {
            id: user.id,
            tax_id: values.taxId?.trim() || null,
            address: values.address?.trim() || null,
            phone: values.phone?.trim() || null,
          },
          { onConflict: 'id' }
        );
      if (customerError) throw customerError;

      refreshProfile();
      message.success('Profile preferences updated successfully.');
    } catch (error) {
      console.error('Unable to save the customer profile.', error);
      message.error('Unable to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 24 } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar
            size={72}
            src={profile?.avatarUrl || undefined}
            alt={profile?.fullName || 'Customer profile'}
            style={{ backgroundColor: '#1677FF', fontSize: 24 }}
          >
            {profileInitials(profile?.fullName ?? null, profile?.email ?? '')}
          </Avatar>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Title level={4} style={{ margin: 0, color: '#172B4D' }}>
                {profile?.fullName || 'Name not provided'}
              </Title>
              {profile?.customer?.status && <Tag color="green">{profile.customer.status}</Tag>}
              <Tag color="blue">Customer Account</Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {profile?.email || 'Email unavailable'}
              {profile?.customer?.joinedAt
                ? ` • Member since ${new Date(profile.customer.joinedAt).toLocaleDateString()}`
                : ''}
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
                <Col xs={24} sm={12}>
                  <Form.Item name="phone" label="Phone number">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="address" label="Default Freight Delivery Address">
                <Input prefix={<HomeOutlined />} />
              </Form.Item>

              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
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
