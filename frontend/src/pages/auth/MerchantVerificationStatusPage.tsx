import React, { useEffect, useState } from 'react';
import { Card, Typography, Tag, Button } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';

const { Title, Text } = Typography;

const MerchantVerificationStatusPage: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<string>('PENDING');

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user) return;
      const { data } = await supabase.from('merchant_profiles').select('status').eq('id', user.id).single();
      if (data?.status) setStatus(data.status);
    };
    load();
  }, [user]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA', padding: 24 }}>
      <Card style={{ width: 460 }}>
        <Title level={4} style={{ color: '#172B4D' }}>Merchant verification status</Title>
        <Tag color={status === 'APPROVED' ? 'green' : status === 'REJECTED' ? 'red' : 'gold'}>{status}</Tag>
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">
            {status === 'APPROVED'
              ? 'Your merchant account is approved. You can submit offers.'
              : 'Your account is pending review. Offer submission is disabled until approval.'}
          </Text>
        </div>
        <div style={{ marginTop: 16 }}>
          <Button type="primary" onClick={() => window.location.assign('/merchant/dashboard')}>Continue</Button>
        </div>
      </Card>
    </div>
  );
};

export default MerchantVerificationStatusPage;