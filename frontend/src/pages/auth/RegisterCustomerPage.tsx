import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, Select, Checkbox, Space } from 'antd';
import { useAuth } from '../../context/AuthContext';
import axiosClient from '../../api/axiosClient';
import {
  authReturnState,
  safeAuthReturnLocation,
} from '../../utils/authReturnLocation';

const { Title, Text } = Typography;

const RegisterCustomerPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const resendVerification = async () => {
    if (!supabase || !email || cooldown > 0) return;
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/verify-email` },
    });
    if (err) { setError(err.message); return; }
    setCooldown(60);
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    setError(null);
    setEmail(values.email);
    try {
      await axiosClient.post('/api/v1/auth/register/customer', {
        email: values.email,
        password: values.password,
        full_name: values.fullName,
        account_type: values.accountType,
        mobile: values.mobile,
      });
      const { error: loginErr } = await signIn(values.email, values.password);
      if (loginErr) {
        setError(
          /email not confirmed|email confirmation/i.test(loginErr)
            ? 'Your account requires email verification before you can continue.'
            : loginErr
        );
        setLoading(false);
        return;
      }
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error('Unable to verify the newly created account.');
      if (!authData.user.email_confirmed_at) {
        setEmail(values.email);
        setError('Your account requires email verification before you can continue.');
        setLoading(false);
        return;
      }

      const profileRole = authData.user.user_metadata?.role;
      if (profileRole !== 'customer') {
        throw new Error('The newly created account is not a customer account.');
      }

      const returnLocation = safeAuthReturnLocation(location.state);
      navigate(
        returnLocation
          ? `${returnLocation.pathname}${returnLocation.search}${returnLocation.hash}`
          : '/customer/dashboard',
        { replace: true }
      );
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Registration failed.');
      setLoading(false);
      return;
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
      <Card style={{ width: 520 }}>
        <Title level={3} style={{ color: '#172B4D' }}>Customer Registration</Title>
        {error && (
          <Alert
            type="error"
            message={error}
            style={{ marginBottom: 16 }}
            action={
              error.includes('email verification') ? (
                <Button
                  disabled={cooldown > 0}
                  onClick={() => void resendVerification()}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
                </Button>
              ) : undefined
            }
          />
        )}
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
        <Text>
          Already have an account?{' '}
          <Link
            to="/auth/login?role=customer"
            state={authReturnState(
              safeAuthReturnLocation(location.state) || {
                pathname: '/customer/dashboard',
                search: '',
                hash: '',
              }
            )}
          >
            Sign in
          </Link>
        </Text>
      </Card>
    </div>
  );
};

export default RegisterCustomerPage;