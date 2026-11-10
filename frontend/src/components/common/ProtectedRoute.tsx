import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { AppRole } from '../../context/AuthContext';
import { Button, Result } from 'antd';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, role, loading, profileLoading, profileError, refreshProfile } = useAuth();
  const location = useLocation();

  if (loading || (user && profileLoading)) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profileError) {
    return (
      <Result
        status="error"
        title="Unable to verify your account"
        subTitle={profileError}
        extra={<Button onClick={refreshProfile}>Retry</Button>}
      />
    );
  }

  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;