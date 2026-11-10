import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, Select, Space } from 'antd';
import { useAuth } from '../../context/AuthContext';
import axiosClient from '../../api/axiosClient';

const { Title, Text } = Typography;

const RegisterMerchantPage: React.FC = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);
    setError(null);
    try {
      await axiosClient.post('/api/v1/auth/register/merchant', {
        email: values.email,
        password: values.password,
        business_name: values.businessName,
        owner_name: values.ownerName,
        mobile: values.mobile,
        business_address: values.businessAddress,
        registration_number: values.registrationNumber,
        gst_number: values.gstNumber,
        categories: values.categories,
      });
      const { error: loginErr } = await signIn(values.email, values.password);
      if (loginErr) { setError(loginErr); setLoading(false); return; }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Registration failed.');
      setLoading(false);
      return;
    }
    setSuccess(true);
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
        <Card style={{ width: 460 }}>
          <Title level={4}>Registration complete</Title>
          <Text>Your email is confirmed. Your merchant account is pending review; offer submission will be available after approval.</Text>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="primary" onClick={() => navigate('/merchant/verification-status')}>
              View merchant status
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
      <Card style={{ width: 560 }}>
        <Title level={3} style={{ color: '#172B4D' }}>Merchant Registration</Title>
        {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="businessName" label="Business name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="ownerName" label="Owner name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="mobile" label="Mobile number" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="businessAddress" label="Business address" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="registrationNumber" label="Business registration number" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="gstNumber" label="GST number (optional)">
            <Input />
          </Form.Item>
          <Form.Item name="categories" label="Product categories" rules={[{ required: true }]}>
            <Select mode="multiple" options={[
              { label: 'Office Furniture', value: 'Office Furniture' },
              { label: 'Renewable Energy', value: 'Renewable Energy' },
              { label: 'Commercial Kitchen', value: 'Commercial Kitchen' },
              { label: 'Electronics', value: 'Electronics' },
              { label: 'Food & Beverage', value: 'Food & Beverage' },
            ]} />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm password"
            dependencies={['password']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Register Merchant
            </Button>
          </Form.Item>
        </Form>
        <Text>Already have an account? <Link to="/auth/login">Sign in</Link></Text>
      </Card>
    </div>
  );
};

export default RegisterMerchantPage;