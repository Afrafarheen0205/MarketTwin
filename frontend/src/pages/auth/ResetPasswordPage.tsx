import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert } from 'antd';
import { supabase } from '../../services/supabase';

const { Title } = Typography;

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { password: string }) => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: values.password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    navigate('/auth/login', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
      <Card style={{ width: 420 }}>
        <Title level={3} style={{ color: '#172B4D' }}>Reset password</Title>
        {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="password" label="New password" rules={[{ required: true, min: 8 }]}>
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
              Update password
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default ResetPasswordPage;