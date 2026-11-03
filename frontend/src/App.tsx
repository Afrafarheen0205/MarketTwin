import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import router from './router';
import themeConfig from './theme/themeConfig';

export const App: React.FC = () => {
  return (
    <ConfigProvider theme={themeConfig}>
      <AntApp>
        <RouterProvider router={router} />
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
