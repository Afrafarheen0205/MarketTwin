import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import router from './router';
import themeConfig from './theme/themeConfig';
import { AuthProvider } from './context/AuthContext';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ConfigProvider theme={themeConfig}>
        <AntApp>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </AntApp>
      </ConfigProvider>
    </AuthProvider>
  );
};

export default App;
