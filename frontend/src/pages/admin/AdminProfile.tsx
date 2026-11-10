import React from 'react';
import { Avatar, Card, Descriptions, Tag, Typography } from 'antd';
import { profileInitials, useAuth } from '../../context/AuthContext';

const { Text, Title } = Typography;

const AdminProfile: React.FC = () => {
  const { profile } = useAuth();

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Avatar
          size={64}
          src={profile?.avatarUrl || undefined}
          alt={profile?.fullName || 'Admin profile'}
          style={{ backgroundColor: '#4F46E5', fontSize: 20 }}
        >
          {profileInitials(profile?.fullName ?? null, profile?.email ?? '')}
        </Avatar>
        <div>
          <Title level={4} style={{ margin: 0, color: '#172B4D' }}>
            {profile?.fullName || 'Name not provided'}
          </Title>
          <Text type="secondary">{profile?.email || 'Email unavailable'}</Text>
        </div>
      </div>
      <Descriptions title="Account Preferences" bordered column={1}>
        <Descriptions.Item label="Name">{profile?.fullName || 'Not provided'}</Descriptions.Item>
        <Descriptions.Item label="Email">{profile?.email || 'Unavailable'}</Descriptions.Item>
        <Descriptions.Item label="Role">
          <Tag color="purple">{profile?.role.toUpperCase() || 'UNVERIFIED'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Account created">
          {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Not available'}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default AdminProfile;
