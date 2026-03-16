import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../CartContext';

export default function Navbar({ settings, pages }) {
  const { itemCount, toggleCart } = useCart();
  const publishedPages = (pages || []).filter(p => p.published && !p.is_home);
  const logoText = settings.logo_text || 'LUXE';
  const brandColor = settings.primary_color || '#C2185B';

  return (
    <nav style={styles.nav}>
      <div style={styles.inner}>
        <Link to="/" style={styles.logo}>
          <span style={{ ...styles.logoText, color: brandColor }}>{logoText}</span>
        </Link>

        <div style={styles.links}>
          <Link to="/" style={styles.link}>Home</Link>
          {publishedPages.map(p => (
            <Link key={p.slug} to={`/${p.slug}`} style={styles.link}>
              {p.title}
            </Link>
          ))}
        </div>

        <button onClick={toggleCart} style={styles.cartBtn} aria-label="Open cart">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          {itemCount > 0 && (
            <span style={{ ...styles.badge, background: brandColor }}>
              {itemCount}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: 'var(--kiosk-surface)',
    borderBottom: '1px solid var(--kiosk-border)',
  },
  inner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 32px',
    height: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    textDecoration: 'none',
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.75rem',
    fontWeight: 600,
    letterSpacing: '0.15em',
  },
  links: {
    display: 'flex',
    gap: 32,
    alignItems: 'center',
  },
  link: {
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    fontWeight: 400,
    color: 'var(--kiosk-text-secondary)',
    textDecoration: 'none',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    transition: 'color 0.2s ease',
  },
  cartBtn: {
    position: 'relative',
    color: 'var(--kiosk-text)',
    padding: 10,
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-md)',
    transition: 'background 0.2s',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: '50%',
    fontSize: '0.65rem',
    fontWeight: 700,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
