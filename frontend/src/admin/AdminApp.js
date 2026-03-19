import React, { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import AdminLogin from './AdminLogin';
import ProductsManager from './ProductsManager';
import CategoriesManager from './CategoriesManager';
import SkinConcernsManager from './SkinConcernsManager';
import PageBuilder from './PageBuilder';
import OrdersPanel from './OrdersPanel';
import SettingsPanel from './SettingsPanel';
import * as api from '../api';

const TABS = [
  { id: 'products', label: 'Products', icon: '◆' },
  { id: 'categories', label: 'Categories', icon: '▦' },
  { id: 'concerns', label: 'Skin Concerns', icon: '◎' },
  { id: 'pages', label: 'Pages', icon: '◇' },
  { id: 'orders', label: 'Orders', icon: '▤' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem('admin_token'));
  const [activeTab, setActiveTab] = useState('products');
  const [username, setUsername] = useState(localStorage.getItem('admin_username') || '');
  const [logoText, setLogoText] = useState('');
  const toast = useToast();

  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => document.body.classList.remove('admin-mode');
  }, []);

  useEffect(() => {
    api.getSettings().then(data => {
      setLogoText(data.logo_text || 'Store');
    }).catch(() => {});
  }, []);

  const handleLogin = (data) => {
    setToken(data.token);
    setUsername(data.username);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setToken(null);
    setUsername('');
    toast.info('Signed out');
  };

  if (!token) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'products': return <ProductsManager />;
      case 'categories': return <CategoriesManager />;
      case 'concerns': return <SkinConcernsManager />;
      case 'pages': return <PageBuilder />;
      case 'orders': return <OrdersPanel />;
      case 'settings': return <SettingsPanel />;
      default: return null;
    }
  };

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h1 style={styles.sidebarLogo}>{logoText}</h1>
          <span style={styles.sidebarBadge}>Admin</span>
        </div>

        <nav style={styles.nav}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.navItem,
                ...(activeTab === tab.id ? styles.navItemActive : {}),
              }}
            >
              <span style={styles.navIcon}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <div style={styles.avatar}>{(username || 'A')[0].toUpperCase()}</div>
            <span style={styles.username}>{username}</span>
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Sign Out
          </button>
        </div>
      </aside>

      <main style={styles.main}>
        {renderTab()}
      </main>
    </div>
  );
}

const styles = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
    background: 'var(--admin-bg)',
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: 'var(--admin-card)',
    borderRight: '1px solid var(--admin-border)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 50,
  },
  sidebarHeader: {
    padding: '28px 24px 24px',
    borderBottom: '1px solid var(--admin-border)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  sidebarLogo: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: 'var(--brand)',
  },
  sidebarBadge: {
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--admin-text-hint)',
    background: 'var(--admin-surface)',
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
  },
  nav: {
    flex: 1,
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    fontSize: '0.88rem',
    fontWeight: 500,
    color: 'var(--admin-text-secondary)',
    borderRadius: 'var(--radius-md)',
    transition: 'all 0.15s ease',
    textAlign: 'left',
    width: '100%',
    minHeight: 44,
  },
  navItemActive: {
    background: 'var(--brand-light)',
    color: 'var(--brand)',
    fontWeight: 600,
  },
  navIcon: {
    fontSize: '0.9rem',
    width: 20,
    textAlign: 'center',
  },
  sidebarFooter: {
    padding: '16px',
    borderTop: '1px solid var(--admin-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'var(--brand)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.8rem',
    fontWeight: 700,
  },
  username: {
    fontSize: '0.85rem',
    fontWeight: 500,
    color: 'var(--admin-text)',
  },
  logoutBtn: {
    fontSize: '0.78rem',
    fontWeight: 500,
    color: 'var(--admin-text-hint)',
    textAlign: 'left',
    padding: '8px 0',
    transition: 'color 0.15s',
  },
  main: {
    flex: 1,
    marginLeft: 220,
    padding: '32px 40px',
    minHeight: '100vh',
    overflowY: 'auto',
  },
};
