import React, { useState, useEffect } from 'react';

// Stub — will be expanded in Steps 4-6, 10-11
export default function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem('admin_token'));

  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => document.body.classList.remove('admin-mode');
  }, []);

  if (!token) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--admin-text)' }}>Admin Login (Step 4)</div>;
  }

  return <div style={{ padding: 40, color: 'var(--admin-text)' }}>Admin Panel (Steps 5-11)</div>;
}
