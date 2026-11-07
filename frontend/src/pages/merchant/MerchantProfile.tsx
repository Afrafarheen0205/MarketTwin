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
  Descriptions,
  Rate,
  message,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { profileInitials, useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';

const { Title } = Typography;

export const MerchantProfile: React.FC = () => {
  const [form] = Form.useForm();
  const { user, profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const categories = user?.user_metadata?.categories;
    form.setFieldsValue({
      companyName: profile?.company ?? '',
      contactPerson: profile?.merchant?.contactName || profile?.fullName || '',
      email: profile?.email ?? '',
      phone: user?.user_metadata?.mobile ?? '',
      facilityAddress: profile?.merchant?.factoryLocation || user?.user_metadata?.business_address || '',
      taxId: user?.user_metadata?.registration_number || user?.user_metadata?.gst_number || '',
      categories: profile?.merchant?.category || (
        Array.isArray(categories)
          ? categories.filter((category): category is string => typeof category === 'string').join(', ')
          : typeof categories === 'string' ? categories : ''
      ),
    });
  }, [form, profile, user]);

  const handleSave = async (values: {
    companyName: string;
    contactPerson: string;
    phone?: string;
    facilityAddress?: string;
    taxId?: string;
    categories?: string;
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
          company: values.companyName.trim() || null,
          full_name: values.contactPerson.trim() || null,
        })
        .eq('id', user.id);
      if (profileError) throw profileError;

      const { error: merchantError } = await supabase
        .from('merchant_profiles')
        .upsert(
          {
            id: user.id,
            contact_name: values.contactPerson.trim() || null,
            factory_location: values.facilityAddress?.trim() || null,
            category: values.categories?.trim() || null,
          },
          { onConflict: 'id' }
        );
      if (merchantError) throw merchantError;

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          mobile: values.phone?.trim() || null,
          business_address: values.facilityAddress?.trim() || null,
          registration_number: values.taxId?.trim() || null,
        },
      });
      if (authError) throw authError;

      refreshProfile();
      message.success('Merchant profile details updated.');
    } catch (error) {
      console.error('Unable to save the merchant profile.', error);
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
            alt={profile?.fullName || profile?.company || 'Merchant profile'}
            style={{ backgroundColor: '#FAAD14', fontSize: 24 }}
          >
            {profileInitials(profile?.fullName ?? null, profile?.email ?? '')}
          </Avatar>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Title level={4} style={{ margin: 0, color: '#172B4D' }}>
                {profile?.company || profile?.fullName || 'Name not provided'}
              </Title>
              {profile?.merchant?.status && (
                <Tag color={profile.merchant.status.toUpperCase() === 'APPROVED' ? 'green' : 'gold'}>
                  {profile.merchant.status}
                </Tag>
              )}
              {profile?.merchant?.verifiedTier && <Tag color="blue">{profile.merchant.verifiedTier}</Tag>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              {profile?.merchant?.rating !== null && profile?.merchant?.rating !== undefined && (
                <>
                  <Rate disabled value={profile.merchant.rating} style={{ fontSize: 13, color: '#FAAD14' }} />
                  <span style={{ fontSize: 12, color: '#6B778C' }}>
                    {profile.merchant.rating.toFixed(1)} Rating
                  </span>
                </>
              )}
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
                <Input />
              </Form.Item>

              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
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
              <Descriptions.Item label="Account status">
                {profile?.merchant?.status || 'Not provided'}
              </Descriptions.Item>
              <Descriptions.Item label="Supply categories">
                {profile?.merchant?.category || 'Not provided'}
              </Descriptions.Item>
              <Descriptions.Item label="Business location">
                {profile?.merchant?.factoryLocation || user?.user_metadata?.business_address || 'Not provided'}
              </Descriptions.Item>
              <Descriptions.Item label="Account email">
                {profile?.email || 'Email unavailable'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MerchantProfile;
