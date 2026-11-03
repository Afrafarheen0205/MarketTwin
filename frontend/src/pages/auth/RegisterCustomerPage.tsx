import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, Select, Checkbox, Space } from 'antd';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;

const RegisterCustomerPage: React.FC = () => {
  const navigate = useNavigate();
  const { signUpCustomer } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);
    setError(null);
    const { error: err } = await signUpCustomer({
      email: values.email,
      password: values.password,
      fullName: values.fullName,
      accountType: values.accountType,
    });
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setSuccess(true);
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
        <Card style={{ width: 460 }}>
          <Title level={4}>Verify your email</Title>
          <Text>We sent a verification link to your email. Please verify before signing in.</Text>
          <div style={{ marginTop: 16 }}>
            <Button type="primary" onClick={() => navigate('/auth/login')}>Go to login</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
      <Card style={{ width: 520 }}>
        <Title level={3} style={{ color: '#172B4D' }}>Customer Registration</Title>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="fullName" label="Full name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="mobile" label="Mobile number" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="accountType" label="Account type" rules={[{ required: true }]}>
            <Select options={[{ label: 'Personal', value: 'personal' }, { label: 'Business', value: 'business' }]} />
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
          <Form.Item
            name="terms"
            valuePropName="checked"
            rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Accept terms'))) }]}
          >
            <Checkbox>I accept the terms and conditions</Checkbox>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Register
            </Button>
          </Form.Item>
        </Form>
        <Text>Already have an account? <Link to="/auth/login">Sign in</Link></Text>
      </Card>
    </div>
  );
};

export default RegisterCustomerPage;