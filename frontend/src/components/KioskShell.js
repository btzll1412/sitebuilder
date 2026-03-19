import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Routes, Route } from 'react-router-dom';
import Navbar from './Navbar';
import CartDrawer from './CartDrawer';
import PageRenderer from './PageRenderer';
import ProductDetail from './ProductDetail';
import ShopPage from './ShopPage';
import IdleTimeout from './IdleTimeout';
import * as api from '../api';

// Polling interval for silent refresh (30 seconds)
const POLL_INTERVAL = 30000;

export default function KioskShell() {
  const [settings, setSettings] = useState({});
  const [pages, setPages] = useState([]);

  // Silent refresh function - doesn't show loading states
  const silentRefresh = useCallback(async () => {
    try {
      const [newSettings, newPages] = await Promise.all([
        api.getSettings(),
        api.getPages(),
      ]);
      setSettings(newSettings);
      setPages(newPages);
    } catch {
      // Silent fail - don't disrupt the user
    }
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    api.getSettings()
      .then(data => { if (!cancelled) setSettings(data); })
      .catch(() => {});
    api.getPages()
      .then(data => { if (!cancelled) setPages(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Silent polling every 30 seconds
  useEffect(() => {
    const interval = setInterval(silentRefresh, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [silentRefresh]);

  const bgStyle = settings.bg_image
    ? { minHeight: '100vh', background: `url(${settings.bg_image}) center/cover fixed` }
    : { minHeight: '100vh', background: settings.bg_color || 'var(--kiosk-bg)' };

  return (
    <div style={bgStyle}>
      <Navbar settings={settings} pages={pages} />
      <Routes>
        <Route path="/" element={<PageView slug="home" settings={settings} silentRefresh={silentRefresh} />} />
        <Route path="/shop" element={<ShopPage settings={settings} />} />
        <Route path="/product/:id" element={<ProductDetail settings={settings} />} />
        <Route path="/:slug" element={<PageViewFromParams settings={settings} silentRefresh={silentRefresh} />} />
      </Routes>
      <CartDrawer settings={settings} />
      <IdleTimeout settings={settings} />
    </div>
  );
}

function PageViewFromParams({ settings, silentRefresh }) {
  const { slug } = useParams();
  return <PageView slug={slug} settings={settings} silentRefresh={silentRefresh} />;
}

function PageView({ slug, settings, silentRefresh }) {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getPage(slug)
      .then(setPage)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  // Silent refresh of page content every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      api.getPage(slug)
        .then(data => setPage(data))
        .catch(() => {}); // Silent fail
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [slug]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{
          width: 36, height: 36, border: '3px solid var(--kiosk-elevated)',
          borderTopColor: 'var(--brand)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        textAlign: 'center', padding: '120px 24px',
        fontFamily: 'var(--font-display)', color: 'var(--kiosk-text-secondary)',
      }}>
        <h2 style={{ fontSize: '2rem', marginBottom: 12 }}>Page not found</h2>
        <p>The page you're looking for doesn't exist.</p>
      </div>
    );
  }

  if (!page) return null;

  return <PageRenderer blocks={page.layout} settings={settings} />;
}
