// File: src/app/router/routes.tsx
// Application routes configuration

import { createBrowserRouter } from 'react-router-dom';

// Layout
import Layout from '@/components/layout/Layout';

// Pages
import Dashboard from '@/pages/Dashboard';
import Accounts from '@/pages/Accounts';
import Settings from '@/pages/Settings';
import ApiProxy from '@/pages/ApiProxy';
import Monitor from '@/pages/Monitor';
import TokenStats from '@/pages/TokenStats';
import Security from '@/pages/Security';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'accounts',
        element: <Accounts />,
      },
      {
        path: 'api-proxy',
        element: <ApiProxy />,
      },
      {
        path: 'monitor',
        element: <Monitor />,
      },
      {
        path: 'token-stats',
        element: <TokenStats />,
      },
      {
        path: 'security',
        element: <Security />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
    ],
  },
]);
