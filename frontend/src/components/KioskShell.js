import React, { useState, useEffect } from 'react';
import { useParams, Routes, Route } from 'react-router-dom';
import Navbar from './Navbar';
import CartDrawer from './CartDrawer';
import PageRenderer from './PageRenderer';
import * as api from '../api';

export default function KioskShell() {
  const [settings, setSettings] = useState({});
  const [pages, setPages] = useState([]);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
    api.getPages().then(setPages).catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--kiosk-bg)' }}>
      <Navbar settings={settings} pages={pages} />
      <Routes>
        <Route path="/" element={<PageView slug="home" settings={settings} />} />
        <Route path="/:slug" element={<PageViewFromParams settings={settings} />} />
      </Routes>
      <CartDrawer settings={settings} />
    </div>
  );
}

function PageViewFromParams({ settings }) {
  const { slug } = useParams();
  return <PageView slug={slug} settings={settings} />;
}

function PageView({ slug, settings }) {
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
