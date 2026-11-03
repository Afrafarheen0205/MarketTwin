import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Typography } from 'antd';

const { Title, Text } = Typography;

const UnauthorizedPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
      <Card style={{ width: 460 }}>
        <Title level={4} style={{ color: '#172B4D' }}>403 Unauthorized</Title>
        <Text>You do not have permission to access this page.</Text>
        <div style={{ marginTop: 16 }}>
          <Link to="/">Return home</Link>
        </div>
      </Card>
    </div>
  );
};

export default UnauthorizedPage;