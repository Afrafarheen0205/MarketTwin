import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert } from 'antd';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

const ForgotPasswordPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onFinish = async (values: { email: string }) => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
      <Card style={{ width: 420 }}>
        <Title level={3} style={{ color: '#172B4D' }}>Forgot password</Title>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        {sent ? (
          <Text>Check your email for a reset link.</Text>
        ) : (
          <Form layout="vertical" onFinish={onFinish}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
              <Input />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                Send reset link
              </Button>
            </Form.Item>
          </Form>
        )}
        <div style={{ marginTop: 12 }}>
          <Link to="/auth/login">Back to login</Link>
        </div>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;