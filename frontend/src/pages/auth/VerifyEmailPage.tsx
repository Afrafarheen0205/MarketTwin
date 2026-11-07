import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Typography } from 'antd';
import {
  authReturnState,
  safeAuthReturnLocation,
} from '../../utils/authReturnLocation';
import { loadReviewedDemandDraft } from '../../utils/reviewedDemandDraft';

const { Title, Text } = Typography;

const VerifyEmailPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const returnLocation =
    safeAuthReturnLocation(location.state) ||
    (loadReviewedDemandDraft()
      ? {
          pathname: '/customer/demands/create',
          search: '?source=ai',
          hash: '',
        }
      : null);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
      <Card style={{ width: 460 }}>
        <Title level={4} style={{ color: '#172B4D' }}>Email verification</Title>
        <Text>
          If you opened this page from a verification link, your email should now be verified. You can continue to sign in.
        </Text>
        <div style={{ marginTop: 16 }}>
          <Button
            type="primary"
            onClick={() =>
              navigate('/auth/login?role=customer', {
                state: returnLocation
                  ? authReturnState(returnLocation)
                  : undefined,
              })
            }
          >
            Go to login
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default VerifyEmailPage;