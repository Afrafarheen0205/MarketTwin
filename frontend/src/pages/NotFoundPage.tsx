import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Result, Button } from 'antd';
import { HomeOutlined } from '@ant-design/icons';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0', textAlign: 'center', padding: '40px 0' }}>
      <Result
        status="404"
        title="404 - Page Not Found"
        subTitle="The requested MarketTwin page does not exist or may have been relocated."
        extra={
          <Button type="primary" icon={<HomeOutlined />} onClick={() => navigate('/')}>
            Back to Dashboard
          </Button>
        }
      />
    </Card>
  );
};

export default NotFoundPage;
