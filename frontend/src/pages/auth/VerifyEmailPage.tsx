import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Typography } from 'antd';

const { Title, Text } = Typography;

const VerifyEmailPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
      <Card style={{ width: 460 }}>
        <Title level={4} style={{ color: '#172B4D' }}>Email verification</Title>
        <Text>
          If you opened this page from a verification link, your email should now be verified. You can continue to sign in.
        </Text>
        <div style={{ marginTop: 16 }}>
          <Link to="/auth/login">Go to login</Link>
        </div>
      </Card>
    </div>
  );
};

export default VerifyEmailPage;