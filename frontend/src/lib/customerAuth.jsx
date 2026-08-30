import { createContext, useContext, useState, useEffect } from 'react';

const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(() => {
    try {
      const saved = localStorage.getItem('rl_customer_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const login = (userData) => {
    setCustomer(userData);
    localStorage.setItem('rl_customer_user', JSON.stringify(userData));
  };

  const logout = () => {
    setCustomer(null);
    localStorage.removeItem('rl_customer_user');
  };

  return (
    <CustomerAuthContext.Provider value={{ customer, isAuthenticated: !!customer, login, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) {
    throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  }
  return ctx;
}
