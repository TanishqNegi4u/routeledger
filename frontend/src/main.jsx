import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/global.css';
import { RouterProvider } from './lib/router.jsx';
import { ToastProvider } from './lib/toast.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { CustomerAuthProvider } from './lib/customerAuth.jsx';
import App from './App.jsx';

/**
 * Provider order matters: the router must be outermost because `navigate()` is called from the axios
 * interceptor that `AuthProvider` depends on, and toasts must be available to the auth screens.
 */
const container = document.getElementById('root');

createRoot(container).render(
  <React.StrictMode>
    <RouterProvider>
      <ToastProvider>
        <AuthProvider>
          <CustomerAuthProvider>
            <App />
          </CustomerAuthProvider>
        </AuthProvider>
      </ToastProvider>
    </RouterProvider>
  </React.StrictMode>,
);
