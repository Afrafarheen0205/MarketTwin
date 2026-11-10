import React from 'react';
import { Card, Modal, Tag, Typography } from 'antd';
import {
  ArrowRightOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { AppRole } from '../../context/AuthContext';
import './RoleSelectionModal.css';

export type AuthAction = 'login' | 'register';

interface RoleSelectionModalProps {
  open: boolean;
  action: AuthAction | null;
  onClose: () => void;
  onSelectRole: (role: AppRole) => void;
}

const { Paragraph, Text, Title } = Typography;

const roles: Array<{
  role: AppRole;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    role: 'customer',
    title: 'Customer',
    description: 'Discover products, place orders and create custom demands.',
    icon: <UserOutlined />,
  },
  {
    role: 'merchant',
    title: 'Merchant',
    description: 'Manage products, submit offers and fulfill customer orders.',
    icon: <ShopOutlined />,
  },
  {
    role: 'admin',
    title: 'Admin',
    description: 'Monitor marketplace activities and manage the platform.',
    icon: <SafetyCertificateOutlined />,
  },
];

const RoleSelectionModal: React.FC<RoleSelectionModalProps> = ({
  open,
  action,
  onClose,
  onSelectRole,
}) => (
  <Modal
    className="role-selection-modal"
    open={open}
    centered
    title={
      <div className="role-selection-heading">
        <Title level={3}>Choose Your Role</Title>
        <Paragraph>Select how you want to access MarketTwin.</Paragraph>
      </div>
    }
    footer={null}
    onCancel={onClose}
    closable
    keyboard
    mask={{ closable: true }}
    width={880}
  >
    <div className="role-selection-grid">
      {roles.map(({ role, title, description, icon }) => {
        const disabled = action === 'register' && role === 'admin';
        return (
          <Card
            key={role}
            className={`role-selection-card${disabled ? ' role-selection-card--disabled' : ''}`}
            hoverable={!disabled}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            onClick={() => {
              if (!disabled) onSelectRole(role);
            }}
            onKeyDown={(event) => {
              if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onSelectRole(role);
              }
            }}
          >
            <div className="role-selection-card-top">
              <span className="role-selection-icon">{icon}</span>
              {disabled ? (
                <Tag icon={<LockOutlined />} className="role-selection-tag">
                  Login only
                </Tag>
              ) : (
                <span className="role-selection-indicator" aria-hidden="true">
                  <ArrowRightOutlined />
                </span>
              )}
            </div>
            <Title level={4}>{title}</Title>
            <Paragraph>{description}</Paragraph>
            {disabled && (
              <Text className="role-selection-restriction">
                Admin accounts are provisioned securely. Public registration is unavailable.
              </Text>
            )}
          </Card>
        );
      })}
    </div>
  </Modal>
);

export default RoleSelectionModal;
